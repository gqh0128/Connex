import { useEffect, useState } from "react";

import { getAppInfo } from "@/lib/tauri/app";
import type { AppInfo } from "@/types/app";

export function useAppInfo() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    let isDisposed = false;

    void getAppInfo()
      .then((nextAppInfo) => {
        if (!isDisposed) {
          setAppInfo(nextAppInfo);
        }
      })
      .catch(() => {
        if (!isDisposed) {
          setAppInfo(null);
        }
      });

    return () => {
      isDisposed = true;
    };
  }, []);

  return appInfo;
}
