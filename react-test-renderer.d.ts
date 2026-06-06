declare module 'react-test-renderer' {
  import * as React from 'react';

  export interface ReactTestInstance {
    type: unknown;
    props: Record<string, any>;
    children: Array<React.ReactNode>;
    findAll(predicate: (node: ReactTestInstance) => boolean): ReactTestInstance[];
    findAllByType(type: unknown): ReactTestInstance[];
    findAllByProps(props: Record<string, any>): ReactTestInstance[];
    findByType(type: unknown): ReactTestInstance;
  }

  export interface ReactTestRenderer {
    root: ReactTestInstance;
    update(element: React.ReactElement): void;
    unmount(): void;
  }

  export function create(element: React.ReactElement): ReactTestRenderer;
  export function act(callback: () => void): void;
  export function act(callback: () => Promise<void>): Promise<void>;
}
