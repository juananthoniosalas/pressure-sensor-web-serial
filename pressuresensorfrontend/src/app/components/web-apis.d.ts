// web-apis.d.ts
// Global Web API typings for WebUSB, Web Serial, Web Bluetooth,
// and File System Access API
// Compatible with LiveMeasurement.tsx (Serial + BLE)

/* eslint-disable @typescript-eslint/no-unused-vars */

export {}

declare global {
  // ============================================
  // Web Serial API
  // ============================================

  interface SerialPort {
    readable: ReadableStream<Uint8Array> | null
    writable: WritableStream<Uint8Array> | null

    open(options: SerialOptions): Promise<void>
    close(): Promise<void>
    forget?(): Promise<void>
  }

  interface SerialOptions {
    baudRate: number
    dataBits?: 7 | 8
    stopBits?: 1 | 2
    parity?: 'none' | 'even' | 'odd'
    flowControl?: 'none' | 'hardware'
  }

  interface SerialPortRequestOptions {
    filters?: {
      usbVendorId?: number
      usbProductId?: number
    }[]
  }

  interface Serial {
    requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>
    getPorts(): Promise<SerialPort[]>
  }

  // ============================================
  // WebUSB API
  // ============================================

  interface USBDevice {
    opened: boolean
    vendorId: number
    productId: number
    deviceClass: number
    deviceSubclass: number
    deviceProtocol: number
    productName?: string
    manufacturerName?: string
    serialNumber?: string
    configuration?: USBConfiguration
    configurations: USBConfiguration[]

    open(): Promise<void>
    close(): Promise<void>
    selectConfiguration(configurationValue: number): Promise<void>
    claimInterface(interfaceNumber: number): Promise<void>
    releaseInterface(interfaceNumber: number): Promise<void>
    selectAlternateInterface(interfaceNumber: number, alternateSetting: number): Promise<void>
    controlTransferIn(setup: USBControlTransferParameters, length: number): Promise<USBInTransferResult>
    controlTransferOut(setup: USBControlTransferParameters, data?: BufferSource): Promise<USBOutTransferResult>
    clearHalt(direction: USBDirection, endpointNumber: number): Promise<void>
    transferIn(endpointNumber: number, length: number): Promise<USBInTransferResult>
    transferOut(endpointNumber: number, data: BufferSource): Promise<USBOutTransferResult>
    reset(): Promise<void>
  }

  interface USBConfiguration {
    configurationValue: number
    configurationName?: string
    interfaces: USBInterface[]
  }

  interface USBInterface {
    interfaceNumber: number
    alternates: USBAlternateInterface[]
  }

  interface USBAlternateInterface {
    alternateSetting: number
    interfaceClass: number
    interfaceSubclass: number
    interfaceProtocol: number
    interfaceName?: string
    endpoints: USBEndpoint[]
  }

  interface USBEndpoint {
    endpointNumber: number
    direction: USBDirection
    type: USBEndpointType
    packetSize: number
  }

  type USBDirection = 'in' | 'out'
  type USBEndpointType = 'bulk' | 'interrupt' | 'isochronous'

  interface USBControlTransferParameters {
    requestType: USBRequestType
    recipient: USBRecipient
    request: number
    value: number
    index: number
  }

  type USBRequestType = 'standard' | 'class' | 'vendor'
  type USBRecipient = 'device' | 'interface' | 'endpoint' | 'other'

  interface USBInTransferResult {
    data?: DataView
    status: USBTransferStatus
  }

  interface USBOutTransferResult {
    bytesWritten: number
    status: USBTransferStatus
  }

  type USBTransferStatus = 'ok' | 'stall' | 'babble'

  interface USBDeviceFilter {
    vendorId?: number
    productId?: number
    classCode?: number
    subclassCode?: number
    protocolCode?: number
  }

  interface USBDeviceRequestOptions {
    filters: USBDeviceFilter[]
  }

  interface USB extends EventTarget {
    getDevices(): Promise<USBDevice[]>
    requestDevice(options: USBDeviceRequestOptions): Promise<USBDevice>
  }

  // ============================================
  // Web Bluetooth API
  // ============================================

  interface BluetoothDevice extends EventTarget {
    id: string
    name?: string
    gatt?: BluetoothRemoteGATTServer
    addEventListener(
      type: 'gattserverdisconnected',
      listener: (this: this, ev: Event) => any
    ): void
  }

  interface BluetoothRemoteGATTServer {
    device: BluetoothDevice
    connected: boolean
    connect(): Promise<BluetoothRemoteGATTServer>
    disconnect(): void
    getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>
  }

  interface BluetoothRemoteGATTService extends EventTarget {
    device: BluetoothDevice
    uuid: string
    getCharacteristic(
      characteristic: BluetoothCharacteristicUUID
    ): Promise<BluetoothRemoteGATTCharacteristic>
  }

  interface BluetoothRemoteGATTCharacteristic extends EventTarget {
    service: BluetoothRemoteGATTService
    uuid: string
    value?: DataView
    readValue(): Promise<DataView>
    writeValue(value: BufferSource): Promise<void>
    startNotifications(): Promise<this>
    stopNotifications(): Promise<this>
    addEventListener(
      type: 'characteristicvaluechanged',
      listener: (this: this, ev: Event) => any
    ): void
  }

  type BluetoothServiceUUID = number | string
  type BluetoothCharacteristicUUID = number | string

  interface Bluetooth {
    requestDevice(options?: {
      filters?: { namePrefix?: string }[]
      optionalServices?: BluetoothServiceUUID[]
    }): Promise<BluetoothDevice>
  }

  // ============================================
  // File System Access API
  // ============================================

  interface FileSystemHandle {
    kind: 'file' | 'directory'
    name: string
  }

  interface FileSystemFileHandle extends FileSystemHandle {
    getFile(): Promise<File>
    createWritable(): Promise<FileSystemWritableFileStream>
  }

  interface FileSystemDirectoryHandle extends FileSystemHandle {
    getFileHandle(
      name: string,
      options?: { create?: boolean }
    ): Promise<FileSystemFileHandle>
  }

  interface FileSystemWritableFileStream extends WritableStream {
    write(data: BufferSource | Blob | string): Promise<void>
    close(): Promise<void>
  }

  // ============================================
  // Extend Navigator & Window
  // ============================================

  interface Navigator {
    serial: Serial
    usb: USB
    bluetooth: Bluetooth
  }

  interface Window {
    showDirectoryPicker(options?: {
      mode?: 'read' | 'readwrite'
      startIn?: 'downloads' | 'documents' | 'desktop'
    }): Promise<FileSystemDirectoryHandle>
  }
}
