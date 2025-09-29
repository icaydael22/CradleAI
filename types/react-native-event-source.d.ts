declare module 'react-native-event-source' {
  export default class EventSource {
    constructor(url: string, initDict?: {
      method?: string;
      headers?: Record<string, string>;
      body?: any;
      withCredentials?: boolean;
    });
    addEventListener(type: string, listener: (event: any) => void): void;
    removeEventListener(type: string, listener: (event: any) => void): void;
    close(): void;
  }
}


