// web-apis.d.ts - Fixed version with proper global declarations
// Place this file in: src/components/ui/web-apis.d.ts

// ============================================
// WebUSB API Types
// ============================================

declare global {
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
    isochronousTransferIn(endpointNumber: number, packetLengths: number[]): Promise<USBIsochronousInTransferResult>
    isochronousTransferOut(endpointNumber: number, data: BufferSource, packetLengths: number[]): Promise<USBIsochronousOutTransferResult>
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

  interface USBIsochronousInTransferResult {
    data?: DataView
    packets: USBIsochronousInTransferPacket[]
  }

  interface USBIsochronousOutTransferResult {
    packets: USBIsochronousOutTransferPacket[]
  }

  interface USBIsochronousInTransferPacket {
    data?: DataView
    status: USBTransferStatus
  }

  interface USBIsochronousOutTransferPacket {
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
    serialNumber?: string
  }

  interface USBDeviceRequestOptions {
    filters: USBDeviceFilter[]
  }

  interface USB extends EventTarget {
    getDevices(): Promise<USBDevice[]>
    requestDevice(options: USBDeviceRequestOptions): Promise<USBDevice>
    addEventListener(type: 'connect' | 'disconnect', listener: (this: this, ev: USBConnectionEvent) => any, useCapture?: boolean): void
  }

  interface USBConnectionEvent extends Event {
    device: USBDevice
  }

  // ============================================
  // Web Bluetooth API Types
  // ============================================

  interface BluetoothDevice extends EventTarget {
    id: string
    name?: string
    gatt?: BluetoothRemoteGATTServer
    watchAdvertisements(): Promise<void>
    unwatchAdvertisements(): void
    addEventListener(type: 'gattserverdisconnected', listener: (this: this, ev: Event) => any, useCapture?: boolean): void
  }

  interface BluetoothRemoteGATTServer {
    device: BluetoothDevice
    connected: boolean
    connect(): Promise<BluetoothRemoteGATTServer>
    disconnect(): void
    getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>
    getPrimaryServices(service?: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService[]>
  }

  interface BluetoothRemoteGATTService extends EventTarget {
    device: BluetoothDevice
    uuid: string
    isPrimary: boolean
    getCharacteristic(characteristic: BluetoothCharacteristicUUID): Promise<BluetoothRemoteGATTCharacteristic>
    getCharacteristics(characteristic?: BluetoothCharacteristicUUID): Promise<BluetoothRemoteGATTCharacteristic[]>
    getIncludedService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>
    getIncludedServices(service?: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService[]>
  }

  interface BluetoothRemoteGATTCharacteristic extends EventTarget {
    service: BluetoothRemoteGATTService
    uuid: string
    properties: BluetoothCharacteristicProperties
    value?: DataView
    readValue(): Promise<DataView>
    writeValue(value: BufferSource): Promise<void>
    writeValueWithResponse(value: BufferSource): Promise<void>
    writeValueWithoutResponse(value: BufferSource): Promise<void>
    startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>
    stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>
    getDescriptor(descriptor: BluetoothDescriptorUUID): Promise<BluetoothRemoteGATTDescriptor>
    getDescriptors(descriptor?: BluetoothDescriptorUUID): Promise<BluetoothRemoteGATTDescriptor[]>
    addEventListener(type: 'characteristicvaluechanged', listener: (this: this, ev: Event) => any, useCapture?: boolean): void
  }

  interface BluetoothCharacteristicProperties {
    broadcast: boolean
    read: boolean
    writeWithoutResponse: boolean
    write: boolean
    notify: boolean
    indicate: boolean
    authenticatedSignedWrites: boolean
    reliableWrite: boolean
    writableAuxiliaries: boolean
  }

  interface BluetoothRemoteGATTDescriptor {
    characteristic: BluetoothRemoteGATTCharacteristic
    uuid: string
    value?: DataView
    readValue(): Promise<DataView>
    writeValue(value: BufferSource): Promise<void>
  }

  type BluetoothServiceUUID = number | string
  type BluetoothCharacteristicUUID = number | string
  type BluetoothDescriptorUUID = number | string

  interface BluetoothLEScanFilter {
    services?: BluetoothServiceUUID[]
    name?: string
    namePrefix?: string
    manufacturerData?: BluetoothManufacturerDataFilter[]
    serviceData?: BluetoothServiceDataFilter[]
  }

  interface BluetoothManufacturerDataFilter {
    companyIdentifier: number
    dataPrefix?: BufferSource
    mask?: BufferSource
  }

  interface BluetoothServiceDataFilter {
    service: BluetoothServiceUUID
    dataPrefix?: BufferSource
    mask?: BufferSource
  }

  interface RequestDeviceOptions {
    filters?: BluetoothLEScanFilter[]
    optionalServices?: BluetoothServiceUUID[]
    acceptAllDevices?: boolean
  }

  interface Bluetooth extends EventTarget {
    getAvailability(): Promise<boolean>
    requestDevice(options?: RequestDeviceOptions): Promise<BluetoothDevice>
    getDevices(): Promise<BluetoothDevice[]>
    addEventListener(type: 'advertisementreceived', listener: (this: this, ev: BluetoothAdvertisingEvent) => any, useCapture?: boolean): void
  }

  interface BluetoothAdvertisingEvent extends Event {
    device: BluetoothDevice
    uuids: string[]
    name?: string
    appearance?: number
    txPower?: number
    rssi?: number
    manufacturerData: Map<number, DataView>
    serviceData: Map<string, DataView>
  }

  // ============================================
  // File System Access API Types
  // ============================================

  interface FileSystemHandle {
    kind: 'file' | 'directory'
    name: string
    isSameEntry(other: FileSystemHandle): Promise<boolean>
    queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
    requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  }

  interface FileSystemHandlePermissionDescriptor {
    mode?: 'read' | 'readwrite'
  }

  interface FileSystemFileHandle extends FileSystemHandle {
    kind: 'file'
    getFile(): Promise<File>
    createWritable(options?: FileSystemCreateWritableOptions): Promise<FileSystemWritableFileStream>
  }

  interface FileSystemDirectoryHandle extends FileSystemHandle {
    kind: 'directory'
    getFileHandle(name: string, options?: FileSystemGetFileOptions): Promise<FileSystemFileHandle>
    getDirectoryHandle(name: string, options?: FileSystemGetDirectoryOptions): Promise<FileSystemDirectoryHandle>
    removeEntry(name: string, options?: FileSystemRemoveOptions): Promise<void>
    resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null>
    keys(): AsyncIterableIterator<string>
    values(): AsyncIterableIterator<FileSystemHandle>
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>
    [Symbol.asyncIterator](): AsyncIterableIterator<[string, FileSystemHandle]>
  }

  interface FileSystemCreateWritableOptions {
    keepExistingData?: boolean
  }

  interface FileSystemGetFileOptions {
    create?: boolean
  }

  interface FileSystemGetDirectoryOptions {
    create?: boolean
  }

  interface FileSystemRemoveOptions {
    recursive?: boolean
  }

  interface FileSystemWritableFileStream extends WritableStream {
    write(data: BufferSource | Blob | string | WriteParams): Promise<void>
    seek(position: number): Promise<void>
    truncate(size: number): Promise<void>
  }

  interface WriteParams {
    type: 'write' | 'seek' | 'truncate'
    size?: number
    position?: number
    data?: BufferSource | Blob | string
  }

  interface FilePickerOptions {
    types?: FilePickerAcceptType[]
    excludeAcceptAllOption?: boolean
    id?: string
    startIn?: WellKnownDirectory | FileSystemHandle
  }

  interface FilePickerAcceptType {
    description?: string
    accept: Record<string, string[]>
  }

  interface DirectoryPickerOptions {
    id?: string
    mode?: 'read' | 'readwrite'
    startIn?: WellKnownDirectory | FileSystemHandle
  }

  type WellKnownDirectory = 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos'

  // ============================================
  // Extend Navigator and Window interfaces
  // ============================================

  interface Navigator {
    usb: USB
    bluetooth: Bluetooth
  }

  interface Window {
    showOpenFilePicker(options?: FilePickerOptions & { multiple?: false }): Promise<[FileSystemFileHandle]>
    showOpenFilePicker(options?: FilePickerOptions & { multiple: true }): Promise<FileSystemFileHandle[]>
    showSaveFilePicker(options?: FilePickerOptions): Promise<FileSystemFileHandle>
    showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>
  }
}

export {}