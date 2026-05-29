import { useEffect, useMemo, useRef } from "react"
import { useLocation } from "react-router-dom"
import { recordTelemetryEvent } from "@/observability/client"

export function RouteTelemetry() {
  const location = useLocation()
  const route = useMemo(
    () => `${location.pathname}${location.search}`,
    [location.pathname, location.search],
  )
  const sessionStartedAtRef = useRef(performance.now())
  const activeRouteRef = useRef<string | null>(null)
  const activeRouteStartedAtRef = useRef(performance.now())

  useEffect(() => {
    void recordTelemetryEvent({
      eventType: "session_start",
      severity: "info",
      route,
    })

    const flushActiveRoute = () => {
      const activeRoute = activeRouteRef.current
      if (!activeRoute) return
      void recordTelemetryEvent({
        eventType: "route_dwell",
        severity: "info",
        route: activeRoute,
        durationMs: Math.max(0, Math.round(performance.now() - activeRouteStartedAtRef.current)),
      })
      activeRouteStartedAtRef.current = performance.now()
    }

    const flushSession = () => {
      flushActiveRoute()
      void recordTelemetryEvent({
        eventType: "session_end",
        severity: "info",
        route: activeRouteRef.current ?? route,
        durationMs: Math.round(performance.now() - sessionStartedAtRef.current),
      })
    }

    const handlePageHide = () => flushSession()
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushSession()
    }

    window.addEventListener("pagehide", handlePageHide)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      flushSession()
      window.removeEventListener("pagehide", handlePageHide)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    const previousRoute = activeRouteRef.current
    const now = performance.now()

    if (previousRoute) {
      void recordTelemetryEvent({
        eventType: "route_dwell",
        severity: "info",
        route: previousRoute,
        durationMs: Math.max(0, Math.round(now - activeRouteStartedAtRef.current)),
      })
    }

    activeRouteRef.current = route
    activeRouteStartedAtRef.current = now

    void recordTelemetryEvent({
      eventType: "page_view",
      severity: "info",
      route,
      pageTitle: document.title || null,
    })
  }, [route])

  return null
}
