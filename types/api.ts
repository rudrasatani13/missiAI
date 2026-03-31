// ─── API Response Envelope Types ──────────────────────────────────────────────

/**
 * Standard API error codes.
 */
export const API_ERROR_CODES = {
  UNAUTHORIZED: "UNAUTHORIZED",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  RATE_LIMITED: "RATE_LIMITED",
  NOT_FOUND: "NOT_FOUND",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
} as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES]

/**
 * Success response envelope.
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true
  data: T
}

/**
 * Error response envelope.
 */
export interface ApiErrorResponse {
  success: false
  error: string
  code: ApiErrorCode
}

/**
 * Union type for all API responses.
 */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse

// ─── Helper functions ─────────────────────────────────────────────────────────

/**
 * Create a success response.
 */
export function successResponse<T>(data: T, status = 200): Response {
  const body: ApiSuccessResponse<T> = { success: true, data }
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/**
 * Create an error response.
 */
export function errorResponse(
  error: string,
  code: ApiErrorCode,
  status: number
): Response {
  const body: ApiErrorResponse = { success: false, error, code }
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/**
 * Standard error responses.
 */
export const standardErrors = {
  unauthorized: () =>
    errorResponse("Unauthorized", API_ERROR_CODES.UNAUTHORIZED, 401),
  
  validationError: (message: string) =>
    errorResponse(message, API_ERROR_CODES.VALIDATION_ERROR, 400),
  
  rateLimited: (retryAfter: number) => {
    const res = errorResponse(
      "Rate limit exceeded. Please slow down.",
      API_ERROR_CODES.RATE_LIMITED,
      429
    )
    res.headers.set("Retry-After", String(retryAfter))
    return res
  },
  
  notFound: (message = "Resource not found") =>
    errorResponse(message, API_ERROR_CODES.NOT_FOUND, 404),
  
  internalError: (message = "Internal server error") =>
    errorResponse(message, API_ERROR_CODES.INTERNAL_ERROR, 500),
  
  payloadTooLarge: (message = "Payload too large") =>
    errorResponse(message, API_ERROR_CODES.PAYLOAD_TOO_LARGE, 413),
}
