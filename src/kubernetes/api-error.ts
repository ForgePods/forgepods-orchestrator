export function isKubernetesApiError(
    error: unknown,
    statusCode: number,
): boolean {
    if (typeof error !== "object" || error === null || !("code" in error)) {
        return false;
    }

    return error.code === statusCode;
}
