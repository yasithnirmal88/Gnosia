/*
 * Minimal type for the untyped `sockjs-client` package (used only as a STOMP
 * webSocketFactory source; the instance is bridged to IStompSocket).
 */
declare module 'sockjs-client' {
  export interface SockJS {
    readyState: number;
    send(data: string): void;
    close(code?: number, reason?: string): void;
  }
  interface SockJSStatic {
    new (url: string): SockJS;
  }
  const SockJS: SockJSStatic;
  export default SockJS;
}