"use client";

// Service Worker 登録
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker is not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    return null;
  }
}

// Push 通知の購読
export async function subscribeToPush(userId: string): Promise<PushSubscription | null> {
  try {
    const registration = await registerServiceWorker();
    if (!registration) return null;

    // 既存の購読があるかチェック
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      // 既に購読済みならサーバーに登録して返す
      await saveSubscription(existing, userId);
      return existing;
    }

    // 新規購読
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      console.error('VAPID public key not found');
      return null;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey).buffer as ArrayBuffer,
    });

    // サーバーに保存
    await saveSubscription(subscription, userId);
    return subscription;
  } catch (error) {
    console.error('Push subscription failed:', error);
    return null;
  }
}

// Push 通知の購読解除
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
    }
    return true;
  } catch (error) {
    console.error('Push unsubscribe failed:', error);
    return false;
  }
}

// 購読情報をサーバーに保存
async function saveSubscription(subscription: PushSubscription, userId: string): Promise<void> {
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      userId,
    }),
  });
}

// Base64 -> Uint8Array 変換
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
