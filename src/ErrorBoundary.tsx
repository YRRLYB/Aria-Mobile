import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryState = { error: Error | null };

// A production shell must never leave the user on a blank white WebView when a
// render error slips through. Keep the last failure visible enough to report
// and offer a one-tap recovery.
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Aria] render error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-[linear-gradient(170deg,#f7f8fb_0%,#eef1fa_60%,#f4eef8_100%)] px-8 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-white text-xl shadow-sm">!</div>
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">页面遇到了一点问题</h1>
          <p className="mt-2 max-w-xs text-xs leading-5 text-neutral-500">
            播放和曲库数据不会因此丢失。重新加载后可以继续使用。
          </p>
          <p className="mt-2 max-w-xs break-all text-[11px] leading-4 text-neutral-400">
            {this.state.error.message}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="tap-scale rounded-full bg-neutral-950 px-6 py-3 text-sm font-medium text-white shadow-sm"
        >
          重新加载
        </button>
      </div>
    );
  }
}
