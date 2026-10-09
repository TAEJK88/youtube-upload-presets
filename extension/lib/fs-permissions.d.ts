// Chrome ships these File System Access APIs; TypeScript's DOM lib does not declare them yet.
interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}
interface FileSystemHandle {
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}
interface DataTransferItem {
  getAsFileSystemHandle(): Promise<FileSystemHandle | null>;
}
interface FilePickerAcceptType { description?: string; accept: Record<string, string[]> }
interface Window {
  showOpenFilePicker(options?: { multiple?: boolean; types?: FilePickerAcceptType[]; excludeAcceptAllOption?: boolean }): Promise<FileSystemFileHandle[]>;
  showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
}
