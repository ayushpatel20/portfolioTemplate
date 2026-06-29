// Preload images
const preloadImages = (selector = 'img') => {
    return new Promise((resolve) => {
        if (window.imagesLoaded) {
            window.imagesLoaded(document.querySelectorAll(selector), {background: true}, resolve);
        } else {
            resolve();
        }
    });
};

export {
    preloadImages,
};
