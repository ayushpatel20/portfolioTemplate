/**
 * team-horizontal.js
 * Horizontal GSAP ScrollTrigger collapse animation for Our Team section.
 * Plain JS loaded after GSAP.
 */
(function () {
  "use strict";

  var RETRY_MS = 100;
  var MAX_RETRIES = 50;
  var retries = 0;

  function tryInit() {
    if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") {
      if (++retries < MAX_RETRIES) setTimeout(tryInit, RETRY_MS);
      return;
    }
    
    // Register ScrollTrigger
    gsap.registerPlugin(ScrollTrigger);

    var galleryEl = document.getElementById("gallery-4");
    if (!galleryEl) {
      if (++retries < MAX_RETRIES) setTimeout(tryInit, RETRY_MS);
      return;
    }

    var galleryItems = galleryEl.querySelectorAll(".gallery__item");
    var galleryCaption = galleryEl.querySelector(".caption");

    if (!galleryItems.length || !galleryCaption) {
      if (++retries < MAX_RETRIES) setTimeout(tryInit, RETRY_MS);
      return;
    }

    // Skip horizontal pinning on mobile screens
    if (window.innerWidth < 992) {
      return;
    }

    // Ensure images are fully loaded before calculating coordinate offsets
    if (window.imagesLoaded) {
      imagesLoaded(galleryEl, { background: true }, function () {
        initScrollCollapse(galleryItems, galleryCaption);
      });
    } else {
      setTimeout(function () {
        initScrollCollapse(galleryItems, galleryCaption);
      }, 500);
    }
  }

  function initScrollCollapse(galleryItems, galleryCaption) {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: "#team-scroll-sec",
        start: "top top",
        end: "+=150%",
        pin: true,
        scrub: 1.2,
        anticipatePin: 1
      }
    });

    // Animate each vertical panel card to slide to the left sequentially
    galleryItems.forEach(function (item, i) {
      if (i === 0) return; // First card stays in place

      // Calculate initial position relative to container
      const initialLeft = item.offsetLeft;
      
      // Calculate target position (offset stack of 32px per card)
      const targetLeft = galleryItems[0].offsetLeft + (i * 32);
      
      // Horizontal translation offset
      const deltaX = targetLeft - initialLeft;

      // Add to timeline
      tl.to(item, {
        x: deltaX,
        ease: "power4.out",
        duration: 1
      }, (i - 1) * 0.7); // staggered start sequence
    });

    // Staggered fade-up for "OUR TEAM" caption
    tl.fromTo(galleryCaption, {
      opacity: 0,
      y: 40
    }, {
      opacity: 1,
      y: 0,
      duration: 0.8,
      ease: "power3.out"
    }, (galleryItems.length - 1) * 0.7 - 0.2);

    // Interactive card hovers for stacked state
    galleryItems.forEach(function (item) {
      item.addEventListener("mouseenter", function () {
        gsap.to(item, {
          y: -15,
          scale: 1.03,
          boxShadow: "0 20px 45px rgba(255, 94, 20, 0.25)",
          borderColor: "#ff5e14",
          duration: 0.35,
          overwrite: "auto"
        });
        item.style.zIndex = "10";
      });

      item.addEventListener("mouseleave", function () {
        gsap.to(item, {
          y: 0,
          scale: 1,
          boxShadow: "0 10px 25px rgba(0, 0, 0, 0.4)",
          borderColor: "rgba(255, 255, 255, 0.05)",
          duration: 0.35,
          overwrite: "auto"
        });
        item.style.zIndex = "1";
      });
    });
  }

  // Start initialization check
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryInit);
  } else {
    tryInit();
  }
})();
