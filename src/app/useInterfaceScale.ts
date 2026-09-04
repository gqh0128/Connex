import { useEffect, useState } from "react";

import {
  getInterfaceScaleFactor,
  type InterfaceScalePercent,
} from "@/types/interfaceScale";
import { setWebviewZoom } from "@/lib/tauri/webview";

export function useInterfaceScale(
  percent: InterfaceScalePercent,
  isPreferencesLoading: boolean,
) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isPreferencesLoading) {
      return;
    }

    let isDisposed = false;
    void setWebviewZoom(getInterfaceScaleFactor(percent))
      .then(() => {
        if (!isDisposed) {
          setError(null);
        }
      })
      .catch(() => {
        if (!isDisposed) {
          setError("无法应用界面缩放，请稍后重试。");
        }
      });

    return () => {
      isDisposed = true;
    };
  }, [isPreferencesLoading, percent]);

  return error;
}
