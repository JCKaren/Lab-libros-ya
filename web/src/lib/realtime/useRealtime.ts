'use client';

import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../config';
import type { Order } from '../types';

export interface StockEvent {
  id: string;
  stock: number;
}

/** Mapa evento → tipo de dato recibido (tipado de extremo a extremo). */
interface EventPayloads {
  'order:created': Order;
  'order:statusChanged': Order;
  'order:updated': Order;
  'book:stockChanged': StockEvent;
}

const EVENTS = ['order:created', 'order:statusChanged', 'order:updated', 'book:stockChanged'] as const;

type Handlers = { [E in keyof EventPayloads]?: (payload: EventPayloads[E]) => void };

interface Options {
  token: string | null;
  handlers: Handlers;
  /** Se llama al reconectar para sincronizar con una consulta REST de recuperación. */
  onSync?: () => void;
}

/**
 * Suscripción a eventos en tiempo real (patrón Observer en el cliente).
 * El servidor decide las salas a partir del JWT; el navegador no elige canales.
 */
export function useRealtime({ token, handlers, onSync }: Options): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef(handlers);
  const syncRef = useRef(onSync);

  useEffect(() => {
    handlersRef.current = handlers;
    syncRef.current = onSync;
  });

  useEffect(() => {
    if (!token) return;
    const socket = io(API_URL, { auth: { token }, transports: ['websocket', 'polling'] });

    let firstConnect = true;
    socket.on('connect', () => {
      setConnected(true);
      if (!firstConnect) syncRef.current?.();
      firstConnect = false;
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    for (const event of EVENTS) {
      socket.on(event, (payload: unknown) => (handlersRef.current[event] as ((p: unknown) => void) | undefined)?.(payload));
    }

    return () => {
      socket.disconnect();
    };
  }, [token]);

  return { connected };
}
