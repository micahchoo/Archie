import type { Component } from "svelte";

/** Memoize a component import so conditional UI stays out of the boot bundle. */
export function lazyComponent<T extends Component<never>>(load: () => Promise<{ default: T }>) {
  let component = $state<T | null>(null);
  let started = false;

  return {
    preload(): void {
      if (started) return;
      started = true;
      void load()
        .then((module) => { component = module.default; })
        .catch(() => { started = false; });
    },
    get current(): T | null {
      this.preload();
      return component;
    },
  };
}
