const ORDERS_PATH = "/dashboard/orders";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  event.waitUntil(handlePush(event));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || ORDERS_PATH;
  event.waitUntil(openOrFocus(url));
});

async function handlePush(event) {
  let payload = {
    title: "New Order",
    body: "A new Air Menu order arrived.",
    tag: "new-order",
    url: ORDERS_PATH,
    orderId: "",
    tableNumber: null,
    finalAmount: 0,
  };

  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch {
    // Use the default copy when the payload is not JSON.
  }

  const windowClients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  if (windowClients.length > 0) {
    for (const client of windowClients) {
      client.postMessage({
        type: "NEW_ORDER_PUSH",
        payload: {
          orderId: payload.orderId,
          tableNumber: payload.tableNumber,
          finalAmount: payload.finalAmount,
        },
      });
    }
    return;
  }

  await self.registration.showNotification(payload.title, {
    body: payload.body,
    tag: payload.tag,
    data: { url: payload.url || ORDERS_PATH },
    renotify: true,
  });
}

async function openOrFocus(url) {
  const windowClients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  for (const client of windowClients) {
    if ("focus" in client) {
      await client.focus();
      if ("navigate" in client) {
        try {
          await client.navigate(url);
        } catch {
          // Focus is enough when navigate is blocked.
        }
      }
      return;
    }
  }

  await self.clients.openWindow(url);
}
