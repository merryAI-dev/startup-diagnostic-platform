import { useEffect } from "react"
import { recordTelemetryEvent } from "@/observability/client"

function route() {
  return `${window.location.pathname}${window.location.search}`
}

function getInteractionLabel(element: HTMLElement) {
  const explicit = element.getAttribute("data-observability-action")
  if (explicit) return explicit.slice(0, 120)

  const aria = element.getAttribute("aria-label")
  if (aria) return aria.slice(0, 120)

  const title = element.getAttribute("title")
  if (title) return title.slice(0, 120)

  const text = element.textContent?.replace(/\s+/g, " ").trim()
  return text ? text.slice(0, 120) : element.tagName.toLowerCase()
}

export function InteractionTelemetry() {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null
      const element = target?.closest("button,a,[role='button'],[data-observability-action]")
      if (!(element instanceof HTMLElement)) return

      const tagName = element.tagName.toLowerCase()
      const eventType = tagName === "a" ? "link_click" : "button_click"
      const label = getInteractionLabel(element)

      void recordTelemetryEvent({
        eventType,
        severity: "info",
        route: route(),
        action: label,
        elementLabel: label,
        elementRole: element.getAttribute("role") || tagName,
        elementTestId: element.getAttribute("data-testid"),
        metadata: {
          disabled: element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true",
        },
      })
    }

    const handleSubmit = (event: SubmitEvent) => {
      const form = event.target instanceof HTMLFormElement ? event.target : null
      if (!form) return

      void recordTelemetryEvent({
        eventType: "form_submit",
        severity: "info",
        route: route(),
        action:
          form.getAttribute("data-observability-action") ||
          form.getAttribute("aria-label") ||
          "form_submit",
        elementRole: "form",
        elementTestId: form.getAttribute("data-testid"),
      })
    }

    document.addEventListener("click", handleClick, true)
    document.addEventListener("submit", handleSubmit, true)

    return () => {
      document.removeEventListener("click", handleClick, true)
      document.removeEventListener("submit", handleSubmit, true)
    }
  }, [])

  return null
}
