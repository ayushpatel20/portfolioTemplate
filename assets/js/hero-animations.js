/**
 * hero-animations.js
 * Premium animations for Hero, Labels, Giant stroke typography, and Transition marquee section.
 * Plain JS loaded after GSAP.
 */
(function () {
  "use strict";

  function initHeroAnimations() {
    if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") {
      setTimeout(initHeroAnimations, 100);
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    // 1. Entrance timeline for top labels and giant headline
    const entranceTl = gsap.timeline({ defaults: { ease: "power4.out" } });

    // Fade-up stagger for top horizontal labels
    entranceTl.to(".hero-top-labels-row", { opacity: 1, duration: 0.1 }, 0)
      .from(".hero-top-label-item", {
        y: 25,
        opacity: 0,
        stagger: 0.15,
        duration: 0.9
      }, 0.15);

    // Animate only once when the page loads
    gsap.fromTo("#hero-title", {
      opacity: 0,
      y: 50,
      scale: 0.96
    }, {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 1.0,
      ease: "power4.out",
      delay: 0.3
    });

    // 3. Slow parallax scroll for background image
    const heroBg = document.getElementById("hero-bg");
    if (heroBg) {
      gsap.to(heroBg, {
        y: "22%",
        ease: "none",
        scrollTrigger: {
          trigger: "#hero-header",
          start: "top top",
          end: "bottom top",
          scrub: true
        }
      });
    }

    // 4. Scroll reveal for the Transition Marquee items below hero
    gsap.utils.toArray(".marquee-item").forEach((item, i) => {
      gsap.to(item, {
        opacity: 1,
        y: 0,
        duration: 1.1,
        ease: "power4.out",
        scrollTrigger: {
          trigger: "#transition-marquee",
          start: "top 85%",
          toggleActions: "play none none none"
        }
      });
    });
  }

  // Trigger when document is loaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeroAnimations);
  } else {
    initHeroAnimations();
  }
})();
