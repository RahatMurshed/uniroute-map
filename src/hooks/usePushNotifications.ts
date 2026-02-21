import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// PushManager types are available in lib.webworker but not always in TS config.
// We cast as needed to avoid type conflicts.

interface PushState {
  supported: boolean;
  permission: NotificationPermission | "default";
  subscribed: boolean;
  loading: boolean;
  subscribedRouteId: string | null;
  subscribedStopId: string | null;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>({
    supported: false,
    permission: "default",
    subscribed: false,
    loading: true,
    subscribedRouteId: null,
    subscribedStopId: null,
  });

  // Check current subscription status
  const checkSubscription = useCallback(async () => {
    const supported = "serviceWorker" in navigator && "PushManager" in navigator && "Notification" in window;
    if (!supported) {
      setState({ supported: false, permission: "default", subscribed: false, loading: false, subscribedRouteId: null, subscribedStopId: null });
      return;
    }

    const permission = Notification.permission;

    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      if (!registration) {
        setState({ supported: true, permission, subscribed: false, loading: false, subscribedRouteId: null, subscribedStopId: null });
        return;
      }

      const subscription = await (registration as any).pushManager.getSubscription();
      if (!subscription) {
        setState({ supported: true, permission, subscribed: false, loading: false, subscribedRouteId: null, subscribedStopId: null });
        return;
      }

      // Check if this endpoint exists in our DB
      const { data } = await supabase
        .from("push_subscriptions")
        .select("route_id, stop_id")
        .eq("endpoint", subscription.endpoint)
        .limit(1)
        .maybeSingle();

      setState({
        supported: true,
        permission,
        subscribed: !!data,
        loading: false,
        subscribedRouteId: data?.route_id ?? null,
        subscribedStopId: data?.stop_id ?? null,
      });
    } catch {
      setState({ supported: true, permission, subscribed: false, loading: false, subscribedRouteId: null, subscribedStopId: null });
    }
  }, []);

  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);

  const subscribe = useCallback(async (routeId: string, stopId: string): Promise<{ success: boolean; error?: string }> => {
    setState((s) => ({ ...s, loading: true }));

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState((s) => ({ ...s, permission, loading: false }));
        return { success: false, error: "Permission denied" };
      }

      // Get VAPID public key from edge function
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/get-vapid-public-key`);
      if (!res.ok) throw new Error("Failed to get VAPID key");
      const { publicKey } = await res.json();

      // Register service worker
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      // Subscribe to push
      const subscription = await (registration as any).pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const keys = subscription.toJSON().keys!;

      // Save to database
      const { error } = await supabase.from("push_subscriptions").insert({
        route_id: routeId,
        stop_id: stopId,
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh!,
        auth_key: keys.auth!,
        user_agent: navigator.userAgent,
      });

      if (error) throw error;

      setState({
        supported: true,
        permission: "granted",
        subscribed: true,
        loading: false,
        subscribedRouteId: routeId,
        subscribedStopId: stopId,
      });

      return { success: true };
    } catch (err: any) {
      setState((s) => ({ ...s, loading: false }));
      return { success: false, error: err.message ?? "Failed to subscribe" };
    }
  }, []);

  const unsubscribe = useCallback(async (): Promise<{ success: boolean }> => {
    setState((s) => ({ ...s, loading: true }));

    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      if (registration) {
        const subscription = await (registration as any).pushManager.getSubscription();
        if (subscription) {
          // Delete from DB
          await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
          // Unsubscribe from push
          await subscription.unsubscribe();
        }
      }

      setState({
        supported: true,
        permission: Notification.permission,
        subscribed: false,
        loading: false,
        subscribedRouteId: null,
        subscribedStopId: null,
      });

      return { success: true };
    } catch {
      setState((s) => ({ ...s, loading: false }));
      return { success: false };
    }
  }, []);

  return { ...state, subscribe, unsubscribe, refresh: checkSubscription };
}
