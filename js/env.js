const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function getConfiguredEnv() {
    const params = new URLSearchParams(window.location.search);
    const queryValue = params.get("env");
    if (queryValue === "hosted" || queryValue === "local") {
        return queryValue;
    }

    const metaValue = document.querySelector('meta[name="archbench-env"]')?.content;
    if (metaValue === "hosted" || metaValue === "local") {
        return metaValue;
    }

    return "auto";
}

function detectEnv() {
    const configured = getConfiguredEnv();
    if (configured !== "auto") {
        return configured;
    }

    const { protocol, hostname } = window.location;
    if (protocol === "file:") {
        return "local";
    }

    if (LOCAL_HOSTS.has(hostname) || hostname.endsWith(".local")) {
        return "local";
    }

    return "hosted";
}

export const APP_ENV = detectEnv();
export const IS_HOSTED = APP_ENV === "hosted";
export const IS_LOCAL = APP_ENV === "local";
