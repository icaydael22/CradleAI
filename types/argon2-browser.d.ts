declare module 'argon2-browser' {
  export enum ArgonType {
    Argon2d = 0,
    Argon2i = 1,
    Argon2id = 2
  }

  interface HashOptions {
    pass: string | Uint8Array;  // password
    salt: string | Uint8Array;  // salt
    time?: number;              // iterations
    mem?: number;              // memory in KiB
    hashLen?: number;          // desired hash length
    type?: ArgonType;          // Argon2 variant
    parallelism?: number;      // desired parallelism
  }

  interface HashResult {
    hash: Uint8Array;          // hash
    hashHex: string;           // hash in hex encoding
    encoded: string;           // encoded hash with parameters for storage
  }

  export function hash(options: HashOptions): Promise<HashResult>;
}
