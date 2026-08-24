"use client";

import { useCallback, useEffect, useState } from "react";
import type { Route } from "@/lib/types";
import {
  createRouteInApi,
  deleteRouteInApi,
  fetchRoutesFromApi,
  updateRouteInApi,
  type RouteInput,
} from "@/lib/route-api";

export function useRoutes() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRoutes(await fetchRoutesFromApi());
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "ルートの読み込みに失敗しました。";
      setError(message);
      throw loadError;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch(() => {
        // The hook exposes the error state to Settings.
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const createRoute = async (payload: RouteInput) => {
    setError("");
    try {
      const route = await createRouteInApi(payload);
      setRoutes((current) => [...current.filter((item) => item.id !== route.id), route]);
      return route;
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "ルートの追加に失敗しました。";
      setError(message);
      throw saveError;
    }
  };

  const updateRoute = async (id: string, payload: RouteInput) => {
    setError("");
    try {
      const route = await updateRouteInApi(id, payload);
      setRoutes((current) => current.map((item) => (item.id === route.id ? route : item)));
      return route;
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "ルートの更新に失敗しました。";
      setError(message);
      throw saveError;
    }
  };

  const deleteRoute = async (id: string) => {
    setError("");
    try {
      await deleteRouteInApi(id);
      setRoutes((current) => current.filter((item) => item.id !== id));
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "ルートの削除に失敗しました。";
      setError(message);
      throw deleteError;
    }
  };

  return { routes, loading, error, refresh, createRoute, updateRoute, deleteRoute };
}
