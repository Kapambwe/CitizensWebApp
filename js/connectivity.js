window.companyAppConnectivity = (() => {
    let dotNetReference;

    function initialize(reference) {
        dotNetReference = reference;
        window.addEventListener("online", notify);
        window.addEventListener("offline", notify);
        notify();
    }

    function notify() {
        dotNetReference?.invokeMethodAsync("OnBrowserConnectivityChanged", navigator.onLine);
    }

    function getOnline() {
        return navigator.onLine;
    }

    function dispose() {
        window.removeEventListener("online", notify);
        window.removeEventListener("offline", notify);
        dotNetReference = undefined;
    }

    return { initialize, getOnline, dispose };
})();
