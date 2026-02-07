import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import {
  Play,
  Square,
  Send,
  Usb,
  Bluetooth,
  Wifi,
  WifiOff,
  FolderOpen,
} from 'lucide-react'

/* =========================
   Types
========================= */

type ConnectionMode = 'usb' | 'bluetooth'
type DisplayMode = 'raw' | 'filtered'
type ConnStatus = 'disconnected' | 'connected' | 'error'

interface LivePoint {
  x: number
  raw: number
  filtered: number
  seq?: number
}

interface LogEntry {
  timestamp: string
  type: 'info' | 'command' | 'response' | 'error'
  message: string
}

/* =========================
   ADC & GRAPH CONSTANTS
========================= */

const MAX_PLOT = 2000
const USB_VENDOR_ID = 0x1915
const USB_PRODUCT_ID = 0x521A
const BLE_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
const BLE_RX_CHAR_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
const BLE_TX_CHAR_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"

/* =========================
   Component
========================= */

export default function LiveMeasurementPage() {
  const [mode, setMode] = useState<ConnectionMode>('usb')
  const [displayMode, setDisplayMode] = useState<DisplayMode>('raw')
  const [gainValue, setGainValue] = useState<string>('15')

  const [isRunning, setIsRunning] = useState(false)
  const [liveData, setLiveData] = useState<LivePoint[]>([])
  const [connStatus, setConnStatus] = useState<ConnStatus>('disconnected')

  const [logs, setLogs] = useState<LogEntry[]>([])
  const logEndRef = useRef<HTMLDivElement>(null)
  const logContainerRef = useRef<HTMLDivElement>(null)

  const [zoomRange, setZoomRange] = useState(2000)
  const [xStart, setXStart] = useState(0)
  const [yShift, setYShift] = useState(0)
  const [yZoom, setYZoom] = useState(4200)

  // Device refs
  const usbDeviceRef = useRef<USBDevice | null>(null)
  const bleDeviceRef = useRef<any>(null)
  const streamingRef = useRef(false)
  const bleHandlerRef = useRef<any>(null)

  // CSV with folder handle
  const [csvEnabled, setCsvEnabled] = useState(false)
  const [csvDir, setCsvDir] = useState<string>('')
  const [folderHandle, setFolderHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const csvDataRef = useRef<number[]>([])

  const lastMouseRef = useRef<{ x: number; y: number } | null>(null)

  // Check browser support
  const supportsWebUSB = 'usb' in navigator
  const supportsWebBluetooth = 'bluetooth' in navigator

  /* =========================
     Helper functions
  ========================= */

  const addLog = (type: LogEntry['type'], message: string) => {
    setLogs(prev => [
      ...prev,
      {
        timestamp: new Date().toLocaleTimeString(),
        type,
        message,
      },
    ])
  }

  // Smart auto-scroll: only scroll if user is already near bottom
  useEffect(() => {
    const container = logContainerRef.current
    if (!container) return

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100

    if (isNearBottom) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  /* =========================
     DECODING FUNCTIONS
  ========================= */

  const decodeHexToSamples = (hexString: string): number[] => {
    const bytes = []
    for (let i = 0; i < hexString.length; i += 2) {
      bytes.push(parseInt(hexString.substr(i, 2), 16))
    }
    return decodeBytesToSamples(new Uint8Array(bytes))
  }

  const decodeBytesToSamples = (bytes: Uint8Array): number[] => {
    const samples: number[] = []
    for (let i = 0; i < 54; i += 3) {
      const b0 = bytes[i]
      const b1 = bytes[i + 1]
      const b2 = bytes[i + 2]

      const v1 = (((b2 << 4) & 0x0F00) | b0) - 2048
      const v2 = (((b2 << 8) & 0x0F00) | b1) - 2048
      
      samples.push(v1)
      samples.push(v2)
    }
    return samples
  }

  /* =========================
     USB CONNECTION
  ========================= */

  const connectUSB = async () => {
    try {
      if (!supportsWebUSB) {
        addLog('error', 'WebUSB not supported. Use Chrome/Edge/Opera')
        return
      }

      // Close existing connection if any
      if (usbDeviceRef.current) {
        try {
          await usbDeviceRef.current.close()
        } catch (e) {
          console.log('Previous USB device already closed')
        }
        usbDeviceRef.current = null
      }

      addLog('info', 'Requesting USB device...')

      const device = await navigator.usb.requestDevice({
        filters: [{ vendorId: USB_VENDOR_ID, productId: USB_PRODUCT_ID }]
      })

      await device.open()
      
      if (device.configuration === null) {
        await device.selectConfiguration(1)
      }

      // Try to claim interface, release first if needed
      try {
        await device.claimInterface(0)
      } catch (err: any) {
        if (err.message.includes('Unable to claim interface')) {
          addLog('info', 'Interface already claimed, attempting to release and reclaim...')
          try {
            await device.releaseInterface(0)
            await new Promise(r => setTimeout(r, 100))
            await device.claimInterface(0)
          } catch (reclaimErr: any) {
            throw new Error(`Failed to claim interface: ${reclaimErr.message}`)
          }
        } else {
          throw err
        }
      }

      usbDeviceRef.current = device
      setConnStatus('connected')
      addLog('info', '✅ USB device connected')

    } catch (err: any) {
      addLog('error', `USB connection failed: ${err.message}`)
      setConnStatus('error')
    }
  }

  const startUSBStreaming = async () => {
    if (!usbDeviceRef.current) {
      addLog('error', 'No USB device connected')
      return
    }

    try {
      // Send start command: "S0\r\n"
      const encoder = new TextEncoder()
      const startCmd = encoder.encode('S0\r\n')
      
      await usbDeviceRef.current.transferOut(2, startCmd)
      
      streamingRef.current = true
      setIsRunning(true)
      addLog('info', '📡 USB streaming started')

      // Start reading data
      readUSBData()

    } catch (err: any) {
      addLog('error', `USB streaming failed: ${err.message}`)
    }
  }

  const readUSBData = async () => {
    if (!usbDeviceRef.current || !streamingRef.current) return

    try {
      // Read from endpoint 1 (bulk in)
      const result = await usbDeviceRef.current.transferIn(1, 64)
      
      if (result.status === 'ok' && result.data) {
        const decoder = new TextDecoder()
        const text = decoder.decode(result.data)
        
        // Parse data: format is "seq:108_hex_chars\r\n"
        const match = text.match(/^\s*([0-9A-Fa-f]+)\s*:\s*([0-9A-Fa-f]{108})\s*$/)
        
        if (match) {
          const seq = parseInt(match[1], 16) & 0xFF
          const hexData = match[2]
          
          // Decode 54 bytes to samples
          const samples = decodeHexToSamples(hexData)
          
          // Store for CSV
          if (csvEnabled) {
            csvDataRef.current.push(...samples)
          }

          // Update live data
          setLiveData(prev => {
            let next = [...prev]

            for (const s of samples) {
              next.push({
                x: 0,
                raw: s,
                filtered: s,
                seq: seq,
              })
            }

            if (next.length > MAX_PLOT) {
              next = next.slice(next.length - MAX_PLOT)
            }

            return next.map((p, i) => ({ ...p, x: i }))
          })
        }
      }

      // Continue reading
      if (streamingRef.current) {
        setTimeout(readUSBData, 0)
      }

    } catch (err: any) {
      if (streamingRef.current) {
        addLog('error', `USB read error: ${err.message}`)
        streamingRef.current = false
        setIsRunning(false)
      }
    }
  }

  const stopUSBStreaming = async () => {
    if (!usbDeviceRef.current) return

    try {
      streamingRef.current = false
      
      // Send stop command: "B0\r\n"
      const encoder = new TextEncoder()
      const stopCmd = encoder.encode('B0\r\n')
      
      await usbDeviceRef.current.transferOut(2, stopCmd)
      
      setIsRunning(false)
      addLog('info', '🛑 USB streaming stopped')

      // Save CSV if enabled
      await saveCSVIfEnabled()

    } catch (err: any) {
      addLog('error', `USB stop error: ${err.message}`)
    }
  }

  const setUSBGain = async (newGain: number) => {
    if (!usbDeviceRef.current) return

    try {
      // Send gain command: "G" + hex_nibble + "\r\n"
      const encoder = new TextEncoder()
      const gainHex = newGain.toString(16).toUpperCase()
      const gainCmd = encoder.encode(`G${gainHex}\r\n`)
      
      await usbDeviceRef.current.transferOut(2, gainCmd)
      
      addLog('info', `🎚 USB gain set to ${newGain}`)

    } catch (err: any) {
      addLog('error', `USB gain error: ${err.message}`)
    }
  }

  /* =========================
     BLUETOOTH CONNECTION
  ========================= */

  const connectBLE = async () => {
    try {
      if (!supportsWebBluetooth) {
        addLog('error', 'Web Bluetooth not supported. Use Chrome/Edge/Opera with HTTPS')
        return
      }

      // Cleanup existing connection
      if (bleDeviceRef.current) {
        try {
          if (bleDeviceRef.current.rxChar) {
            await bleDeviceRef.current.rxChar.stopNotifications()
          }
          if (bleDeviceRef.current.server && bleDeviceRef.current.server.connected) {
            bleDeviceRef.current.server.disconnect()
          }
        } catch (e) {
          console.log('Previous BLE device already disconnected')
        }
        bleDeviceRef.current = null
      }

      addLog('info', 'Requesting Bluetooth device...')

      const device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'PS02' }],
        optionalServices: [BLE_SERVICE_UUID]
      })

      // Add disconnect handler
      device.addEventListener('gattserverdisconnected', () => {
        addLog('info', 'BLE device disconnected')
        setConnStatus('disconnected')
        bleDeviceRef.current = null
      })

      const server = await device.gatt!.connect()
      const service = await server.getPrimaryService(BLE_SERVICE_UUID)
      
      const rxChar = await service.getCharacteristic(BLE_RX_CHAR_UUID)
      const txChar = await service.getCharacteristic(BLE_TX_CHAR_UUID)

      bleDeviceRef.current = {
        device: device,
        server: server,
        rxChar: rxChar,
        txChar: txChar
      }

      setConnStatus('connected')
      addLog('info', '✅ BLE connected')

    } catch (err: any) {
      addLog('error', `BLE connection failed: ${err.message}`)
      setConnStatus('error')
    }
  }

  const startBLEStreaming = async () => {
    if (!bleDeviceRef.current?.rxChar) {
      addLog('error', 'No BLE device connected')
      return
    }

    try {
      // Create handler function and store reference
      const handler = (event: any) => handleBLEData(event)
      bleHandlerRef.current = handler

      // Subscribe to notifications
      await bleDeviceRef.current.rxChar.startNotifications()
      bleDeviceRef.current.rxChar.addEventListener('characteristicvaluechanged', handler)

      // Send start command: [0xFE, 0x00, 0x53, 0x00, 0x00]
      const startCmd = new Uint8Array([0xFE, 0x00, 0x53, 0x00, 0x00])
      await bleDeviceRef.current.txChar.writeValue(startCmd)

      streamingRef.current = true
      setIsRunning(true)
      addLog('info', '📡 BLE streaming started')

    } catch (err: any) {
      addLog('error', `BLE streaming failed: ${err.message}`)
    }
  }

  const handleBLEData = (event: any) => {
    const data = event.target.value
    
    // BLE packets are 56 bytes: [0x00, seq, ...54 bytes payload]
    if (data.byteLength >= 56) {
      const bytes = new Uint8Array(data.buffer)
      
      if (bytes[0] === 0x00) {
        const seq = bytes[1] & 0x0F
        const payload = bytes.slice(2, 56)
        
        // Decode 54 bytes to samples
        const samples = decodeBytesToSamples(payload)
        
        // Store for CSV
        if (csvEnabled) {
          csvDataRef.current.push(...samples)
        }

        // Update live data
        setLiveData(prev => {
          let next = [...prev]

          for (const s of samples) {
            next.push({
              x: 0,
              raw: s,
              filtered: s,
              seq: seq,
            })
          }

          if (next.length > MAX_PLOT) {
            next = next.slice(next.length - MAX_PLOT)
          }

          return next.map((p, i) => ({ ...p, x: i }))
        })
      }
    }
  }

  const stopBLEStreaming = async () => {
    if (!bleDeviceRef.current?.rxChar) return

    try {
      streamingRef.current = false

      // Send stop command: [0xFE, 0x00, 0x42, 0x00, 0x00]
      const stopCmd = new Uint8Array([0xFE, 0x00, 0x42, 0x00, 0x00])
      await bleDeviceRef.current.txChar.writeValue(stopCmd)

      // Stop notifications and remove event listener
      if (bleHandlerRef.current) {
        bleDeviceRef.current.rxChar.removeEventListener('characteristicvaluechanged', bleHandlerRef.current)
        bleHandlerRef.current = null
      }
      await bleDeviceRef.current.rxChar.stopNotifications()

      setIsRunning(false)
      addLog('info', '🛑 BLE streaming stopped')

      // Save CSV if enabled
      await saveCSVIfEnabled()

    } catch (err: any) {
      addLog('error', `BLE stop error: ${err.message}`)
    }
  }

  const setBLEGain = async (newGain: number) => {
    if (!bleDeviceRef.current?.txChar) return

    try {
      // Send gain command: [0xFE, 0x00, 0x47, gain, 0x00]
      const gainCmd = new Uint8Array([0xFE, 0x00, 0x47, newGain & 0xFF, 0x00])
      await bleDeviceRef.current.txChar.writeValue(gainCmd)

      addLog('info', `🎚 BLE gain set to ${newGain}`)

    } catch (err: any) {
      addLog('error', `BLE gain error: ${err.message}`)
    }
  }

  /* =========================
     CSV HANDLING
  ========================= */

  const handleSelectFolder = async () => {
    try {
      if (!('showDirectoryPicker' in window)) {
        addLog('error', 'Your browser does not support folder selection. Please use Chrome, Edge, or Opera.')
        return
      }

      // @ts-ignore
      const dirHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'downloads'
      })

      setFolderHandle(dirHandle)
      setCsvDir(dirHandle.name)
      
      addLog('info', `Folder selected: ${dirHandle.name}`)
    } catch (err: any) {
      if (err.name === 'AbortError') {
        addLog('info', 'Folder selection cancelled')
      } else {
        addLog('error', `Folder selection failed: ${err.message}`)
      }
    }
  }

  const saveCSVIfEnabled = async () => {
    if (!csvEnabled || !folderHandle || csvDataRef.current.length === 0) {
      csvDataRef.current = []
      return
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
      const filename = `data_${timestamp}.csv`
      
      // Create CSV content
      let csvContent = 'index,raw\n'
      csvDataRef.current.forEach((value, index) => {
        csvContent += `${index},${value}\n`
      })

      // Create file in selected folder
      const fileHandle = await folderHandle.getFileHandle(filename, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(csvContent)
      await writable.close()
      
      addLog('response', `✅ CSV saved to ${csvDir}/${filename} (${csvDataRef.current.length} samples)`)
      csvDataRef.current = []
    } catch (err: any) {
      addLog('error', `Failed to save CSV: ${err.message}`)
      csvDataRef.current = []
    }
  }

  /* =========================
     UNIFIED CONTROLS
  ========================= */

  const handleConnect = async () => {
    if (mode === 'usb') {
      await connectUSB()
    } else {
      await connectBLE()
    }
  }

  const handleStart = async () => {
    addLog('command', `${mode.toUpperCase()} START`)
    
    setLiveData([])
    setXStart(0)
    setZoomRange(2000)
    setYShift(0)
    setYZoom(4200)
    csvDataRef.current = []

    if (connStatus !== 'connected') {
      await handleConnect()
      await new Promise(r => setTimeout(r, 500))
    }

    if (mode === 'usb') {
      await startUSBStreaming()
    } else {
      await startBLEStreaming()
    }
  }

  const handleStop = async () => {
    addLog('command', `${mode.toUpperCase()} STOP`)

    if (mode === 'usb') {
      await stopUSBStreaming()
    } else {
      await stopBLEStreaming()
    }
  }

  const handleSendGain = async () => {
    const gain = Number(gainValue)

    if (
      gainValue.trim() === '' ||
      Number.isNaN(gain) ||
      !Number.isInteger(gain) ||
      gain < 0 ||
      gain > 15
    ) {
      addLog('error', 'Gain must be an integer between 0 and 15')
      return
    }

    try {
      addLog('command', `${mode.toUpperCase()} SET_GAIN ${gain}`)

      if (mode === 'usb') {
        await setUSBGain(gain)
      } else {
        await setBLEGain(gain)
      }

      addLog('response', `✅ Gain set to ${gain}`)
    } catch (e: any) {
      addLog('error', `SET_GAIN failed: ${e?.message ?? 'unknown error'}`)
    }
  }

  const handleSwitchMode = async (next: ConnectionMode) => {
    if (next === mode) return

    if (isRunning) {
      await handleStop()
      await new Promise(r => setTimeout(r, 500))
    }

    // Disconnect current device properly
    if (mode === 'usb' && usbDeviceRef.current) {
      try {
        await usbDeviceRef.current.releaseInterface(0)
        await usbDeviceRef.current.close()
        usbDeviceRef.current = null
      } catch (e) {
        console.log('Error closing USB:', e)
      }
    } else if (mode === 'bluetooth' && bleDeviceRef.current) {
      try {
        if (bleHandlerRef.current && bleDeviceRef.current.rxChar) {
          bleDeviceRef.current.rxChar.removeEventListener('characteristicvaluechanged', bleHandlerRef.current)
          bleHandlerRef.current = null
        }
        if (bleDeviceRef.current.rxChar) {
          await bleDeviceRef.current.rxChar.stopNotifications()
        }
        if (bleDeviceRef.current.server && bleDeviceRef.current.server.connected) {
          bleDeviceRef.current.server.disconnect()
        }
        bleDeviceRef.current = null
      } catch (e) {
        console.log('Error closing BLE:', e)
      }
    }

    setConnStatus('disconnected')
    setLiveData([])
    setXStart(0)
    setYShift(0)
    setMode(next)
    addLog('info', `Mode switched to ${next.toUpperCase()}`)
  }

  /* =========================
     CHART HANDLERS
  ========================= */

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const zoomFactor = 0.08
    const delta = e.deltaY > 0 ? 1 : -1

    setZoomRange(prev => {
      const next = prev + (prev * zoomFactor * delta)
      return Math.round(Math.max(10, next))
    })

    setYZoom(prev => {
      const next = prev + (prev * zoomFactor * delta)
      return Math.round(Math.max(50, next))
    })
  }

  const handleChartMouseDownCapture = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    lastMouseRef.current = { x: e.clientX, y: e.clientY }
  }

  const handleChartMouseMoveCapture = (e: React.MouseEvent) => {
    if (!lastMouseRef.current) return

    const dx = e.clientX - lastMouseRef.current.x
    const dy = e.clientY - lastMouseRef.current.y

    const scaleX = zoomRange / 1200
    const scaleY = yZoom / 600

    setXStart(prev => Math.round(prev - (dx * scaleX)))
    setYShift(prev => Math.round(prev + (dy * scaleY)))

    lastMouseRef.current = { x: e.clientX, y: e.clientY }
  }

  const handleChartMouseUpCapture = () => {
    lastMouseRef.current = null
  }

  const handleChartMouseEnter = () => {
    document.body.style.overflow = 'hidden'
  }

  const handleChartMouseLeave = () => {
    document.body.style.overflow = 'auto'
  }

  useEffect(() => {
    return () => {
      document.body.style.overflow = 'auto'
    }
  }, [])

  /* =========================
     UI helpers
  ========================= */

  const statusLabel =
    connStatus === 'connected'
      ? 'Connected'
      : connStatus === 'error'
        ? 'Error'
        : 'Disconnected'

  const statusIcon =
    connStatus === 'connected' ? (
      <Wifi className="w-4 h-4 text-green-600" />
    ) : (
      <WifiOff className="w-4 h-4 text-gray-400" />
    )

  const dynamicYMin = yShift - (yZoom / 2)
  const dynamicYMax = yShift + (yZoom / 2)
  
  const generateTicks = (min: number, max: number, count: number) => {
    const ticks = []
    const step = (max - min) / (count - 1)
    for (let i = 0; i < count; i++) {
      ticks.push(Math.round(min + step * i))
    }
    return ticks
  }

  const xTicks = useMemo(() => generateTicks(xStart, xStart + zoomRange, 11), [xStart, zoomRange])
  const yTicks = useMemo(() => generateTicks(dynamicYMin, dynamicYMax, 5), [dynamicYMin, dynamicYMax])

  
  /* =========================
     Render
  ========================= */

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {/* Browser Support Warning */}
      {(!supportsWebUSB || !supportsWebBluetooth) && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h3 className="font-semibold text-yellow-800 mb-1">Browser Compatibility</h3>
              <p className="text-sm text-yellow-700">
                {!supportsWebUSB && '• WebUSB is not supported. '}
                {!supportsWebBluetooth && '• Web Bluetooth is not supported. '}
                <br />
                Please use <strong>Google Chrome, Microsoft Edge, or Opera</strong> browser for full functionality.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="p-6 bg-white border rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            {mode === 'usb' ? (
              <Usb className="w-5 h-5 text-blue-600" />
            ) : (
              <Bluetooth className="w-5 h-5 text-blue-600" />
            )}
            Device Status
          </h3>

          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm text-gray-600">Mode</span>
              <span className="text-sm font-medium">{mode.toUpperCase()}</span>
            </div>

            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm text-gray-600">Status</span>
              <span
                className={
                  connStatus === 'connected'
                    ? 'text-sm font-medium text-green-600'
                    : connStatus === 'error'
                      ? 'text-sm font-medium text-red-600'
                      : 'text-sm font-medium text-gray-600'
                }
              >
                {isRunning ? 'Streaming' : 'Stopped'}
              </span>
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600">Connection</span>
              <div className="flex items-center gap-1">
                {statusIcon}
                <span className="text-sm">{statusLabel}</span>
              </div>
            </div>
          </div>

          {connStatus === 'disconnected' && (
            <button
              onClick={handleConnect}
              disabled={mode === 'usb' ? !supportsWebUSB : !supportsWebBluetooth}
              className="mt-4 w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              🔌 Connect Device
            </button>
          )}
        </div>

        <div className="p-6 bg-white border rounded-lg shadow-sm lg:col-span-2">
          <h3 className="text-lg font-semibold mb-4">Control Panel</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-gray-600 mb-2">
                Connection Mode
              </label>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="connMode"
                    checked={mode === 'usb'}
                    onChange={() => handleSwitchMode('usb')}
                    disabled={!supportsWebUSB}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">USB</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="connMode"
                    checked={mode === 'bluetooth'}
                    onChange={() => handleSwitchMode('bluetooth')}
                    disabled={!supportsWebBluetooth}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Bluetooth</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-2">
                Gain (0–15)
              </label>

              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  max={15}
                  value={gainValue}
                  onChange={e => setGainValue(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-md"
                />

                <button
                  onClick={handleSendGain}
                  disabled={connStatus !== 'connected'}
                  className="px-4 py-2 text-white rounded-md flex items-center gap-2 transition-colors disabled:bg-gray-300"
                  style={{ backgroundColor: connStatus === 'connected' ? '#912335' : undefined }}
                  onMouseEnter={(e) => connStatus === 'connected' && (e.currentTarget.style.backgroundColor = '#7a1e2d')}
                  onMouseLeave={(e) => connStatus === 'connected' && (e.currentTarget.style.backgroundColor = '#912335')}
                >
                  <Send className="w-4 h-4" />
                  Send
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-2">
                Measurement Control
              </label>

              <div className="flex gap-2">
                <button
                  onClick={handleStart}
                  disabled={isRunning}
                  className="px-4 py-2 text-white rounded-md disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                  style={{ backgroundColor: isRunning ? '#d1d5db' : '#912335' }}
                  onMouseEnter={(e) => !isRunning && (e.currentTarget.style.backgroundColor = '#7a1e2d')}
                  onMouseLeave={(e) => !isRunning && (e.currentTarget.style.backgroundColor = '#912335')}
                >
                  <Play className="w-4 h-4" />
                  Start
                </button>

                <button
                  onClick={handleStop}
                  disabled={!isRunning}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Square className="w-4 h-4" />
                  Stop
                </button>
              </div>

              <p className="text-xs text-gray-500 mt-2">
                Direct browser connection - no backend needed
              </p>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-2">
                Display Mode
              </label>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="displayMode"
                    checked={displayMode === 'raw'}
                    onChange={() => setDisplayMode('raw')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Raw</span>
                </label>
              </div>
            </div>

            {/* CSV Section */}
            <div className="md:col-span-2 border-t pt-4">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                📁 CSV Export Settings
              </label>

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="csv-enable"
                    checked={csvEnabled}
                    onChange={(e) => setCsvEnabled(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="csv-enable" className="text-sm cursor-pointer">
                    Enable CSV save on STOP
                  </label>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleSelectFolder}
                    disabled={!csvEnabled}
                    className="flex-1 px-4 py-2 text-white rounded-md disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                    style={{ backgroundColor: csvEnabled ? '#912335' : '#d1d5db' }}
                    onMouseEnter={(e) => csvEnabled && (e.currentTarget.style.backgroundColor = '#7a1e2d')}
                    onMouseLeave={(e) => csvEnabled && (e.currentTarget.style.backgroundColor = '#912335')}
                  >
                    <FolderOpen className="w-4 h-4" />
                    {csvDir ? 'Change Folder' : 'Select Save Folder'}
                  </button>
                </div>

                {csvDir && (
                  <div className="bg-green-50 border border-green-200 rounded-md p-3">
                    <div className="flex items-start gap-2">
                      <FolderOpen className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-green-800 mb-1">
                          Selected Folder:
                        </div>
                        <div className="text-sm text-green-700 font-mono break-all">
                          {csvDir}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                  <div className="text-xs text-blue-800">
                    <strong>💡 How it works:</strong>
                    <ul className="mt-1 ml-4 space-y-1 list-disc">
                      <li>Device connects directly in your browser (no backend needed!)</li>
                      <li>CSV files save directly to your selected folder</li>
                      <li>Works in Chrome, Edge, and Opera browsers</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CHART SECTION */}
      <div className="p-6 bg-white border rounded-lg shadow-sm mb-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Real-Time Pressure</h3>
          <button 
            onClick={() => {
              setXStart(0)
              setZoomRange(2000)
              setYShift(0)
              setYZoom(4200)
            }}
            className="text-xs text-white px-3 py-1 rounded border transition-colors"
            style={{ backgroundColor: '#912335', borderColor: '#7a1e2d' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#7a1e2d'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#912335'}
          >
            Reset View
          </button>
        </div>

        <div
          className="h-96 select-none cursor-grab active:cursor-grabbing border-2 border-gray-300 bg-white"
          style={{ touchAction: 'none' }} 
          onWheel={handleWheel}
          onMouseEnter={handleChartMouseEnter}
          onMouseLeave={handleChartMouseLeave}
          onMouseDownCapture={handleChartMouseDownCapture}
          onMouseMoveCapture={handleChartMouseMoveCapture}
          onMouseUpCapture={handleChartMouseUpCapture}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart 
              data={liveData} 
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke="#e5e7eb" vertical={true} horizontal={true} />
              
              <XAxis
                dataKey="x"
                type="number"
                domain={[xStart, xStart + zoomRange]}
                ticks={xTicks}
                interval={0}
                allowDataOverflow
                stroke="#374151"
                fontSize={12}
                tickLine={{ stroke: '#374151' }}
                axisLine={{ stroke: '#374151' }}
                label={{ value: 'Point', position: 'insideBottom', offset: -5, fontWeight: 'bold' }}
              />
              
              <YAxis
                type="number"
                domain={[dynamicYMin, dynamicYMax]}
                ticks={yTicks}
                interval={0}
                allowDataOverflow
                stroke="#374151"
                fontSize={12}
                tickLine={{ stroke: '#374151' }}
                axisLine={{ stroke: '#374151' }}
                label={{ value: 'AD値', angle: -90, position: 'insideLeft', fontWeight: 'bold' }}
              />

              <Line
                type="linear"
                dataKey={displayMode === 'raw' ? 'raw' : 'filtered'}
                stroke="#2563eb"
                strokeWidth={1}
                dot={zoomRange < 150}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {!isRunning && connStatus === 'disconnected' && (
          <p className="text-sm text-gray-600 mt-3">
            Click <b>🔌 Connect Device</b> then press <b>Start</b> to begin streaming.
          </p>
        )}

        {!isRunning && connStatus === 'connected' && (
          <p className="text-sm text-gray-600 mt-3">
            Press <b>Start</b> to begin streaming data.
          </p>
        )}

        <p className="text-xs text-gray-500 mt-2">
          Drag to pan, scroll to zoom. Direct browser connection - no server needed!
        </p>
      </div>

      {/* LOG SECTION */}
      <div className="p-6 bg-white border rounded-lg shadow-sm">
        <h3 className="text-lg font-semibold mb-4">System Log</h3>

        <div 
          ref={logContainerRef}
          className="bg-gray-900 rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm"
        >
          {logs.map((log, index) => (
            <div key={index} className="mb-1">
              <span className="text-gray-500">[{log.timestamp}]</span>{' '}
              <span
                className={
                  log.type === 'command'
                    ? 'text-blue-400'
                    : log.type === 'response'
                      ? 'text-green-400'
                      : log.type === 'error'
                        ? 'text-red-400'
                        : 'text-gray-400'
                }
              >
                {log.type === 'command' ? '>' : log.type === 'response' ? '<' : '•'}
              </span>{' '}
              <span
                className={
                  log.type === 'command'
                    ? 'text-blue-300'
                    : log.type === 'response'
                      ? 'text-green-300'
                      : log.type === 'error'
                        ? 'text-red-300'
                        : 'text-gray-300'
                }
              >
                {log.message}
              </span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  )
}