import { onUnmounted, ref } from "vue";

type ContextMenuOptions = {
  menuWidth?: number;
  menuHeight?: number;
  viewportPadding?: number;
  closeOnOutsideClick?: boolean;
};

type ContextMenuPosition = {
  x: number;
  y: number;
};

const DEFAULT_OPTIONS: Required<ContextMenuOptions> = {
  menuWidth: 220,
  menuHeight: 180,
  viewportPadding: 8,
  closeOnOutsideClick: true,
};

const clamp = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
};

export function useContextMenu() {
  const isVisible = ref(false);
  const x = ref(0);
  const y = ref(0);

  let outsideHandlersBound = false;

  const resolveOptions = (options?: ContextMenuOptions): Required<ContextMenuOptions> => ({
    ...DEFAULT_OPTIONS,
    ...(options || {}),
  });

  const computePosition = (
    event: Pick<MouseEvent, "clientX" | "clientY">,
    options?: ContextMenuOptions,
  ): ContextMenuPosition => {
    const resolved = resolveOptions(options);
    if (typeof window === "undefined") {
      return {
        x: event.clientX,
        y: event.clientY,
      };
    }

    const maxX = Math.max(
      resolved.viewportPadding,
      window.innerWidth - resolved.menuWidth - resolved.viewportPadding,
    );
    const maxY = Math.max(
      resolved.viewportPadding,
      window.innerHeight - resolved.menuHeight - resolved.viewportPadding,
    );

    return {
      x: clamp(event.clientX, resolved.viewportPadding, maxX),
      y: clamp(event.clientY, resolved.viewportPadding, maxY),
    };
  };

  const close = () => {
    isVisible.value = false;
  };

  const bindOutsideHandlers = () => {
    if (outsideHandlersBound || typeof document === "undefined" || typeof window === "undefined") {
      return;
    }
    outsideHandlersBound = true;
    document.addEventListener("click", close, true);
    document.addEventListener("contextmenu", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
  };

  const unbindOutsideHandlers = () => {
    if (!outsideHandlersBound || typeof document === "undefined" || typeof window === "undefined") {
      return;
    }
    outsideHandlersBound = false;
    document.removeEventListener("click", close, true);
    document.removeEventListener("contextmenu", close, true);
    window.removeEventListener("resize", close);
    window.removeEventListener("blur", close);
  };

  const open = (event: MouseEvent, options?: ContextMenuOptions) => {
    const resolved = resolveOptions(options);
    const position = computePosition(event, resolved);
    x.value = position.x;
    y.value = position.y;
    isVisible.value = true;
    if (resolved.closeOnOutsideClick) {
      bindOutsideHandlers();
    }
    return position;
  };

  const toggle = (event: MouseEvent, options?: ContextMenuOptions) => {
    if (isVisible.value) {
      close();
      return { x: x.value, y: y.value };
    }
    return open(event, options);
  };

  onUnmounted(() => {
    unbindOutsideHandlers();
  });

  return {
    isVisible,
    x,
    y,
    open,
    close,
    toggle,
    computePosition,
  };
}
