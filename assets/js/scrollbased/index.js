// Import the necessary function for preloading images
import { preloadImages } from './utils.js';

// Define a variable that will store the Lenis smooth scrolling object
let lenis;

// Function to initialize Lenis for smooth scrolling
const initSmoothScrolling = () => {
	if (typeof ScrollSmoother !== "undefined" && ScrollSmoother.get()) {
		console.log("ScrollSmoother is active; skipping Lenis smooth scroll.");
		return;
	}
	if (typeof Lenis !== "undefined") {
		// Instantiate the Lenis object with specified properties
		lenis = new Lenis({
			lerp: 0.1, // Lower values create a smoother scroll effect
			smoothWheel: true // Enables smooth scrolling for mouse wheel events
		});

		// Update ScrollTrigger each time the user scrolls
		lenis.on('scroll', () => ScrollTrigger.update());

		// Define a function to run at each animation frame
		const scrollFn = (time) => {
			lenis.raf(time); // Run Lenis' requestAnimationFrame method
			requestAnimationFrame(scrollFn); // Recursively call scrollFn on each frame
		};
		// Start the animation frame loop
		requestAnimationFrame(scrollFn);
	}
};

// Function to trigger Flip animations when scrolling
const triggerFlipOnScroll = (galleryEl, options) => {
	if (window.innerWidth < 992) return;
	// Default settings for Flip and ScrollTrigger
	let settings = {
		flip: {
			absoluteOnLeave: false,
			absolute: false,
			scale: true,
			simple: true,
			//...
		},
		scrollTrigger: {
			start: 'center center',
			end: '+=300%',
		},
		stagger: 0
	};

	// Merge default settings with options provided when calling the function
	settings = Object.assign({}, settings, options);
	
	// Select elements within the gallery that will be animated
	const galleryCaption = galleryEl.querySelector('.caption');
	const galleryItems = galleryEl.querySelectorAll('.gallery__item');
	const galleryItemsInner = [...galleryItems].map(item => item.children.length > 0 ? [...item.children] : []).flat();
	
	// Temporarily add the final class to capture the final state
	galleryEl.classList.add('gallery--switch');
	const flipstate = Flip.getState([galleryItems, galleryCaption], {props: 'filter, opacity'});

	// Remove the final class to revert to the initial state
	galleryEl.classList.remove('gallery--switch');
	
	// Target the newly structured caption elements
	const ourWord = galleryEl.querySelector('.title-our');
	const teamWord = galleryEl.querySelector('.title-team');
	
	// Create the title animation timeline
	const titleTl = gsap.timeline({ paused: true });
	titleTl.fromTo(ourWord, {
		opacity: 0,
		y: 30
	}, {
		opacity: 1,
		y: 0,
		duration: 0.8,
		ease: "power4.out"
	})
	.fromTo(teamWord, {
		opacity: 0,
		y: 30
	}, {
		opacity: 1,
		y: 0,
		duration: 0.8,
		ease: "power4.out"
	}, 0.15); // stagger offset of 0.15s

	let titleAnimated = false;

	// Create the Flip animation timeline
	const tl = Flip.to(flipstate, {
		ease: 'none',
		absoluteOnLeave: settings.flip.absoluteOnLeave,
		absolute: settings.flip.absolute,
		scale: settings.flip.scale,
		simple: settings.flip.simple,
		scrollTrigger: {
			trigger: galleryEl,
			start: settings.scrollTrigger.start,
			end: settings.scrollTrigger.end,
			pin: galleryEl.parentNode,
			scrub: 1.2,
			onUpdate: self => {
				let progress = self.progress;
				
				// Card scale and shadow logic (1 -> 0.98 -> 1 scale, and dynamic shadow)
				let scaleVal = 1 - 0.02 * Math.sin(progress * Math.PI);
				let shadowBlur = 25 + 20 * Math.sin(progress * Math.PI);
				let shadowOpacity = 0.4 + 0.2 * Math.sin(progress * Math.PI);
				
				gsap.set(galleryItems, { 
					scale: scaleVal,
					boxShadow: `0 ${10 + 10 * Math.sin(progress * Math.PI)}px ${shadowBlur}px rgba(0, 0, 0, ${shadowOpacity})`,
					force3D: true
				});
				
				// Title animation triggers when cards are fully collapsed
				if (progress >= 0.98) {
					if (!titleAnimated) {
						titleAnimated = true;
						gsap.killTweensOf(titleTl);
						gsap.delayedCall(0.2, () => titleTl.play());
					}
				} else {
					if (titleAnimated) {
						titleAnimated = false;
						gsap.killTweensOf(titleTl);
						titleTl.reverse();
					}
				}
			}
		},
		stagger: settings.stagger
	});

	// If there are inner elements in the gallery items, animate them too
	if ( galleryItemsInner.length ) {
		tl.fromTo(galleryItemsInner, {
			scale: 2
		}, {
			scale: 1,
			scrollTrigger: {
				trigger: galleryEl,
				start: settings.scrollTrigger.start,
				end: settings.scrollTrigger.end,
				scrub: 1.2,
			},
		}, 0)
	}
};

// Function to apply scroll-triggered animations to various galleries
// Apply scroll-triggered animations to each gallery with specific settings
const scroll = () => {
	// Define the gallery IDs and their options
    const galleries = [
        { id: '#gallery-4' },
    ];

    // Loop through the galleries and apply the scroll-triggered animations
    galleries.forEach(gallery => {
        const galleryElement = document.querySelector(gallery.id);
        triggerFlipOnScroll(galleryElement, gallery.options);
    });
}

// Preload images, initialize smooth scrolling, apply scroll-triggered animations, and remove loading class from body
const tryInitScroll = () => {
	const teamGalleryItems = document.querySelectorAll('#gallery-4 .gallery__item');
	if (teamGalleryItems.length === 0) {
		setTimeout(tryInitScroll, 50);
		return;
	}
	preloadImages('.gallery__item').then(() => {
		initSmoothScrolling();
		scroll();
		document.body.classList.remove('loading');
	});
};
tryInitScroll();