import {
  createContext,
  useCallback,
  useContext,
  useRef,
  type ReactNode,
} from "react";
import {
  findNodeHandle,
  KeyboardAvoidingView,
  ScrollView,
  TextInput,
  UIManager,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
  type ScrollViewProps,
  type StyleProp,
  type TextInputFocusEvent,
  type TextInputProps,
  type ViewStyle,
} from "react-native";

type EnsureVisible = (nativeNode: number | null) => void;

const KeyboardScrollContext = createContext<EnsureVisible>(() => {});

/**
 * Attach to TextInput `onFocus` so the focused field scrolls above the keyboard.
 * Must be used in a component rendered *inside* KeyboardAwareScroll (context).
 * Safe outside a KeyboardAwareScroll (no-op).
 */
export function useEnsureInputVisible(): {
  onFocus: (e: TextInputFocusEvent) => void;
} {
  const ensureVisible = useContext(KeyboardScrollContext);
  return {
    onFocus: (e) => {
      const target = (e as NativeSyntheticEvent<{ target?: number }>).nativeEvent
        .target;
      const fromEvent = typeof target === "number" ? target : null;
      const fromTarget = findNodeHandle(
        // Host event target; findNodeHandle accepts the focused input instance.
        (e as unknown as { target?: Parameters<typeof findNodeHandle>[0] })
          .target ?? null,
      );
      ensureVisible(fromEvent ?? fromTarget ?? null);
    },
  };
}

/** TextInput that scrolls into view on focus when inside KeyboardAwareScroll. */
export function KeyboardAwareTextInput(props: TextInputProps) {
  const { onFocus: ensureVisible } = useEnsureInputVisible();
  return (
    <TextInput
      {...props}
      onFocus={(e) => {
        ensureVisible(e);
        props.onFocus?.(e);
      }}
    />
  );
}

type Props = {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  /** Extra offset when a fixed chrome sits above this view. */
  keyboardVerticalOffset?: number;
} & Pick<
  ScrollViewProps,
  | "keyboardShouldPersistTaps"
  | "showsVerticalScrollIndicator"
  | "nestedScrollEnabled"
  | "horizontal"
  | "scrollEnabled"
>;

/**
 * KeyboardAvoidingView (padding on iOS + Android) + ScrollView that can
 * scroll a focused TextInput into view.
 *
 * Expo edge-to-edge Android no longer resizes the window for the keyboard,
 * so `behavior="padding"` is required on both platforms (see Expo keyboard guide).
 * Avoid react-native-keyboard-controller here — it needs a new native build;
 * this stays OTA-friendly.
 */
export function KeyboardAwareScroll(props: Props) {
  const {
    children,
    contentContainerStyle,
    style,
    keyboardVerticalOffset = 0,
    keyboardShouldPersistTaps = "handled",
    showsVerticalScrollIndicator,
    nestedScrollEnabled,
    horizontal,
    scrollEnabled,
  } = props;

  const scrollRef = useRef<ScrollViewInstance | null>(null);

  const ensureVisible = useCallback<EnsureVisible>((nativeNode) => {
    if (nativeNode == null) return;
    const scroll = scrollRef.current;
    if (!scroll) return;

    // Wait for KeyboardAvoidingView padding to settle, then bring caret into view.
    setTimeout(() => {
      const responder = scroll.getScrollResponder?.() as
        | {
            scrollResponderScrollNativeHandleToKeyboard?: (
              node: number,
              offset: number,
              animated: boolean,
            ) => void;
          }
        | null
        | undefined;

      if (
        responder &&
        typeof responder.scrollResponderScrollNativeHandleToKeyboard ===
          "function"
      ) {
        responder.scrollResponderScrollNativeHandleToKeyboard(
          nativeNode,
          120,
          true,
        );
        return;
      }

      const scrollNode = findNodeHandle(scroll);
      if (scrollNode == null) return;
      UIManager.measureLayout(
        nativeNode,
        scrollNode,
        () => {},
        (_left, top) => {
          scroll.scrollTo({ y: Math.max(0, top - 24), animated: true });
        },
      );
    }, 80);
  }, []);

  return (
    <KeyboardScrollContext.Provider value={ensureVisible}>
      <KeyboardAvoidingView
        behavior="padding"
        style={[{ flex: 1 }, style]}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={contentContainerStyle}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={showsVerticalScrollIndicator}
          nestedScrollEnabled={nestedScrollEnabled}
          horizontal={horizontal}
          scrollEnabled={scrollEnabled}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </KeyboardScrollContext.Provider>
  );
}

/**
 * Non-scrolling shell for short forms (sign-in, lock) where a ScrollView
 * would fight a centered layout. Still uses padding avoidance on both OSes.
 */
export function KeyboardAvoid(props: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
}) {
  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={[{ flex: 1 }, props.style]}
      keyboardVerticalOffset={props.keyboardVerticalOffset ?? 0}
    >
      {props.children}
    </KeyboardAvoidingView>
  );
}
