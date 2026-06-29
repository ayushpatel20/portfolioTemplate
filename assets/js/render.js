// Ready event capturer for scripts.js and other plugins that rely on $(document).ready()
(function() {
    window.capturedReadyHandlers = [];
    if (window.jQuery) {
        jQuery.fn.ready = function(fn) {
            if (fn) {
                window.capturedReadyHandlers.push(fn);
            }
            return this;
        };
    } else {
        console.error("jQuery not found before loading render.js!");
    }
})();

// Helper to load component HTML
async function loadComponent(placeholderId, filePath) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const html = await response.text();
        const placeholder = document.getElementById(placeholderId);
        if (placeholder) {
            placeholder.outerHTML = html;
        }
    } catch (error) {
        console.error(`Error loading component ${filePath}:`, error);
    }
}

// Helper to fetch JSON data
// Checks localStorage first (set by admin panel), falls back to the actual JSON file
async function fetchJSON(filePath) {
    try {
        // Build localStorage key from file path: "data/profile.json" → "portfolio_profile"
        const lsKey = 'portfolio_' + filePath.replace('data/', '').replace('.json', '');
        let cached = localStorage.getItem(lsKey);
        
        // Clear cached legacy webp projects to load on-disk png works images
        if (lsKey === 'portfolio_projects' && cached) {
            try {
                const parsed = JSON.parse(cached);
                if (parsed.some(p => p.bgImage && p.bgImage.includes('.webp'))) {
                    localStorage.removeItem(lsKey);
                    cached = null;
                }
            } catch (e) {
                localStorage.removeItem(lsKey);
                cached = null;
            }
        }

        // Clear cached legacy about settings to load high-res hero background image
        if (lsKey === 'portfolio_about' && cached) {
            try {
                const parsed = JSON.parse(cached);
                if (parsed.hero && parsed.hero.bgImage && parsed.hero.bgImage.includes('pattern-bg')) {
                    localStorage.removeItem(lsKey);
                    cached = null;
                }
            } catch (e) {
                localStorage.removeItem(lsKey);
                cached = null;
            }
        }
        
        if (cached) {
            return JSON.parse(cached);
        }
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error(`Error fetching JSON ${filePath}:`, error);
        return null;
    }
}

// Execute the captured ready handlers once everything is rendered
function triggerThemeReady() {
    console.log("DOM rendering complete. Executing ready handlers...");
    if (window.jQuery) {
        window.capturedReadyHandlers.forEach(handler => {
            try {
                handler(window.jQuery);
            } catch (e) {
                console.error("Error executing theme ready handler:", e);
            }
        });
    }
}

// Helper to read query parameters
function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

// Render dynamic components
document.addEventListener("DOMContentLoaded", async () => {
    // 1. Load layout components
    await loadComponent("cursor-placeholder", "components/cursor.html");
    await loadComponent("navbar-placeholder", "components/navbar.html");
    await loadComponent("footer-placeholder", "components/footer.html");

    // 2. Fetch global data
    const profile = await fetchJSON("data/profile.json");
    if (profile) {
        // Render footer contact
        const footerContact = document.getElementById("footer-contact");
        if (footerContact) {
            footerContact.innerHTML = `
                <p class="mb-10px">${profile.contact.address}</p>
                <p class="mb-10px">${profile.contact.email}</p>
                <p class="">${profile.contact.phone}</p>
            `;
        }
        // Render footer socials
        const footerSocials = document.getElementById("footer-socials");
        if (footerSocials) {
            footerSocials.innerHTML = profile.socialLinks.map(link => `
                <a href="${link.url}"> <i class="${link.iconClass}"></i> </a>
            `).join('\n');
        }
        // Render copyright
        const footerCopyright = document.getElementById("footer-copyright");
        if (footerCopyright) {
            footerCopyright.textContent = `© ${new Date().getFullYear()} ${profile.siteName} Agency. All Rights Reserved`;
        }
    }

    // Determine current page and render contents
    const path = window.location.pathname;
    
    if (path.includes("project-details.html")) {
        await renderProjectDetails();
    } else if (path.includes("blog-details.html")) {
        await renderBlogDetails();
    } else if (path.includes("blog.html")) {
        await renderBlogList();
    } else {
        // Default to home startup
        await renderHomeStartup();
    }

    // Trigger image data-background background-images assignment
    document.querySelectorAll(".bg-img").forEach(el => {
        const bg = el.getAttribute("data-background");
        if (bg) {
            el.style.backgroundImage = `url('${bg}')`;
        }
    });

    // 4. Load scripts.js dynamically so that immediate DOM queries execute correctly
    const script = document.createElement("script");
    script.src = "assets/js/scripts.js";
    script.onload = () => {
        triggerThemeReady();
        setTimeout(() => {
            if (typeof ScrollTrigger !== "undefined") {
                ScrollTrigger.refresh();
                console.log("ScrollTrigger refreshed after layout render.");
            }
        }, 300);
    };
    document.body.appendChild(script);
});

// ----------------- PAGE RENDERING LOGIC -----------------

async function renderHomeStartup() {
    // Fetch JSON assets
    const about = await fetchJSON("data/about.json");
    const services = await fetchJSON("data/services.json");
    const projects = await fetchJSON("data/projects.json");
    const testimonials = await fetchJSON("data/testimonials.json");
    const team = await fetchJSON("data/team.json");
    const blogs = await fetchJSON("data/blogs.json");
    // Render About
    if (about) {
        // Render Hero
        if (about.hero) {
            const heroDescs = document.querySelectorAll("#hero-desc, .hero-desc-text");
            heroDescs.forEach(el => {
                el.textContent = about.hero.description;
            });
            
            const heroTag1 = document.getElementById("hero-tag1");
            if (heroTag1) heroTag1.textContent = about.hero.tag1;

            const heroTag2 = document.getElementById("hero-tag2");
            if (heroTag2) heroTag2.textContent = about.hero.tag2;

            const heroTag3 = document.getElementById("hero-tag3");
            if (heroTag3) heroTag3.textContent = about.hero.tag3;

            const heroTitle = document.getElementById("hero-title");
            if (heroTitle) heroTitle.textContent = about.hero.title;

            const heroHeader = document.getElementById("hero-header");
            if (heroHeader && about.hero.bgImage) {
                heroHeader.setAttribute("data-background", about.hero.bgImage);
            }
        }

        const expContainer = document.getElementById("exp-container");
        if (expContainer) {
            expContainer.innerHTML = `
                <h2 class="fs-70 mb-15px">${about.experience.count} <span class="fs-20">${about.experience.suffix}</span></h2>
                <p>${about.experience.text}</p>
            `;
        }
        const introTitleContainer = document.getElementById("intro-title-container");
        if (introTitleContainer) {
            introTitleContainer.innerHTML = `
                <h4 class="text-indent mb-50px">${about.intro.title}
                    <span class="d-inline opacity-7">${about.intro.highlightedText}</span>.
                </h4>
            `;
        }
        const introDescContainer = document.getElementById("intro-desc-container");
        if (introDescContainer) {
            introDescContainer.innerHTML = `<p class="pb-40px">${about.intro.description}</p>`;
        }
    }

    // Render General Services
    if (services && services.generalServices) {
        const servicesContainer = document.getElementById("general-services-container");
        if (servicesContainer) {
            servicesContainer.innerHTML = services.generalServices.map(service => `
                <div class="item col-lg-3 col-md-6">
                    <div class="icon mb-40px">
                        <img src="${service.icon}" class="h-60px" alt="">
                    </div>
                    <h6><a href="#0">${service.title}</a></h6>
                    <div class="text mt-40px">
                        <p>${service.description}</p>
                    </div>
                </div>
            `).join('\n');
        }
    }

    // Render Portfolio Grid
    if (projects) {
        const portfolioContainer = document.getElementById("portfolio-container");
        if (portfolioContainer) {
            portfolioContainer.innerHTML = projects.map(project => `
                <div class="item cursor-pointer" onclick="location.href='project-details.html?id=${project.id}'">
                    <div class="bg-img" data-background="${project.bgImage}">
                        <div class="cont">
                            <div class="position-relative">
                                <a href="project-details.html?id=${project.id}" class="link-overlay"></a>
                                <h5>${project.title}</h5>
                                <span>${project.category}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('\n');
        }
    }

    // Render Featured Services Accordion
    if (services && services.featuredServices) {
        const featuredContainer = document.getElementById("featured-services-accordion");
        if (featuredContainer) {
            featuredContainer.innerHTML = services.featuredServices.map((service, index) => `
                <div class="row mb-50px">
                    <div class="col-lg-2 md-mb30 bg-img background-position-center"
                        data-background="${service.bgImage}">
                    </div>
                    <div class="col-lg-9 offset-lg-1">
                        <div class="accordion-item ${index === 0 ? 'active' : ''}">
                            <div class="accordion-header" id="heading${service.id}">
                                <div class="accordion-button" type="button"
                                    data-bs-toggle="collapse" data-bs-target="#collapse${service.id}"
                                    aria-expanded="${index === 0}" aria-controls="collapse${service.id}">
                                    <div class="row align-items-center">
                                        <div class="col-lg-3 md-mb30">
                                            <h6>${service.num}</h6>
                                        </div>
                                        <div class="col-lg-7 col-8 md-mb30">
                                            <h3 class="text-uppercase">${service.title}</h3>
                                        </div>
                                        <div class="col-lg-2 col-4 d-flex justify-content-end">
                                            <div class="icon-arrow">
                                                <svg width="18" height="18" viewBox="0 0 18 18"
                                                    fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <path
                                                        d="M13.922 4.5V11.8125C13.922 11.9244 13.8776 12.0317 13.7985 12.1108C13.7193 12.1899 13.612 12.2344 13.5002 12.2344C13.3883 12.2344 13.281 12.1899 13.2018 12.1108C13.1227 12.0317 13.0783 11.9244 13.0783 11.8125V5.51953L4.79547 13.7953C4.71715 13.8736 4.61092 13.9176 4.50015 13.9176C4.38939 13.9176 4.28316 13.8736 4.20484 13.7953C4.12652 13.717 4.08252 13.6108 4.08252 13.5C4.08252 13.3892 4.12652 13.283 4.20484 13.2047L12.4806 4.92188H6.18765C6.07577 4.92188 5.96846 4.87743 5.88934 4.79831C5.81023 4.71919 5.76578 4.61189 5.76578 4.5C5.76578 4.38811 5.81023 4.28081 5.88934 4.20169C5.96846 4.12257 6.07577 4.07813 6.18765 4.07812H13.5002C13.612 4.07813 13.7193 4.12257 13.7985 4.20169C13.8776 4.28081 13.922 4.38811 13.922 4.5Z"
                                                        fill="currentColor"></path>
                                                </svg>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div id="collapse${service.id}" class="accordion-collapse collapse ${index === 0 ? 'show' : ''}"
                                aria-labelledby="heading${service.id}" data-bs-parent="#accordionExample">
                                <div class="row accordion-body pt-30px">
                                    <div class="col-lg-3">
                                        <div class="tags text-uppercase fs-14 md-mb30">
                                            ${service.tags.map(tag => `<a href="#0">${tag}</a>`).join('\n')}
                                        </div>
                                    </div>
                                    <div class="col-lg-9">
                                        <p class="opacity-7">${service.description}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('\n');
        }
    }

    // Render Testimonials Slider
    if (testimonials) {
        const testimonialsWrapper = document.getElementById("testimonials-wrapper");
        if (testimonialsWrapper) {
            testimonialsWrapper.innerHTML = testimonials.map(testimonial => `
                <div class="swiper-slide ${testimonial.bgClass}">
                    <svg class="w-90px" xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 800 800">
                        <defs>
                            <style>
                                .cls-1 { fill: #fff; }
                                .cls-2 { fill: none; }
                                .cls-3 { fill: #333; }
                            </style>
                        </defs>
                        <path class="${testimonial.bgClass && (testimonial.bgClass.includes('bg-light') || testimonial.bgClass.includes('bg-main-color')) ? 'cls-3' : 'cls-1'}"
                            d="M225.87,344.5a233.54,233.54,0,0,1,66.2-60.93l7.93-4.9v-64.1l-19.77,3.76C77,256.67,66.67,421.53,66.67,454.17,66.67,524.4,108.37,600,199.9,600A128.53,128.53,0,0,0,333.24,476.46q.12-2.88.09-5.76A130.2,130.2,0,0,0,225.87,344.5Zm-26,222.17c-73.73,0-99.9-60.6-99.9-112.5,0-37.84,12.4-160.24,166.67-198.77v4.87a266.2,266.2,0,0,0-84,89.83L171.37,375H200a98,98,0,0,1,100,95.7,95.94,95.94,0,0,1-95.81,96.06Q202,566.76,199.9,566.67Zm426-222.17a233.71,233.71,0,0,1,66.17-60.93l7.93-4.9v-64.1l-19.77,3.76C477,256.67,466.67,421.53,466.67,454.17,466.67,524.4,508.37,600,599.9,600A128.53,128.53,0,0,0,733.24,476.46q.12-2.88.09-5.76A130.2,130.2,0,0,0,625.87,344.5Zm-26,222.17c-73.7,0-99.87-60.6-99.87-112.5,0-37.84,12.4-160.24,166.67-198.77v4.87a266.2,266.2,0,0,0-84,89.83L571.37,375H600a98,98,0,0,1,100,95.7,95.94,95.94,0,0,1-95.81,96.06q-2.15,0-4.29-.09Z" />
                        <path class="cls-2" d="M0,0H800V800H0Z" />
                    </svg>
                    <p>${testimonial.quote}</p>
                    <div class="info-text d-flex align-items-center mt-80px">
                        <div>
                            <div class="img fit-img h-60px w-60px border-radius-50 o-hidden">
                                <img src="${testimonial.avatar}" alt="">
                            </div>
                        </div>
                        <div class="ml-15px">
                            <h6 class="fs-18 mb-10px">${testimonial.author}</h6>
                            <p class="fs-14">${testimonial.role}</p>
                        </div>
                    </div>
                </div>
            `).join('\n');
        }
    }

    // Render Team List — Horizontal collapse layout using original cards and layout
    if (team) {
        const galleryContainer = document.getElementById("gallery-4");
        if (galleryContainer) {
            let html = team.slice(0, 6).map((member, i) => `
                <div class="gallery__item">
                    <div class="${member.itemClass}">
                        <a href="#0" class="w-100 fit-img ${member.heightClass}">
                            <img src="${member.image}" alt="" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;">
                        </a>
                        <div class="cont mt-15px">
                            <h6>${member.name}</h6>
                            <span class="text-uppercase mt-10px fs-14 opacity-7 d-block">${member.role}</span>
                        </div>
                    </div>
                </div>
            `).join('\n');
            
            // Add the "Our Team" caption
            html += `
                <div class="caption">
                    <h2 class="team-title text-uppercase">
                        <span class="title-word title-our">OUR</span>
                        <span class="title-word title-team">TEAM</span>
                    </h2>
                </div>
            `;
            
            galleryContainer.innerHTML = html;
        }
    }

    // Render Blogs Slider
    if (blogs) {
        const blogsWrapper = document.getElementById("blogs-wrapper");
        if (blogsWrapper) {
            blogsWrapper.innerHTML = blogs.map(blog => `
                <div class="swiper-slide">
                    <div class="item">
                        <div class="fit-img h-250px border-radius-15px o-hidden">
                            <img src="${blog.image}" alt="">
                        </div>
                        <div class="text mt-30px">
                            <div class="info fs-13 mb-20px d-flex align-items-center">
                                <span class="opacity-7">${blog.category}</span>
                                <span class="mr-15px ml-15px opacity-7">|</span>
                                <span class="fs-14 opacity-7">${blog.date}</span>
                            </div>
                            <h6><a href="blog-details.html?id=${blog.id}">${blog.title}</a></h6>
                        </div>
                    </div>
                </div>
            `).join('\n');
        }
    }

    // Render Contact Form Validation & Mock Submissions
    setupContactForm();
}

async function renderProjectDetails() {
    const projects = await fetchJSON("data/projects.json");
    const projectId = getQueryParam("id") || "1";
    const project = projects ? projects.find(p => p.id === projectId) : null;

    if (!project) {
        document.getElementById("project-details-container").innerHTML = `<h3>Project not found</h3>`;
        return;
    }

    // Dynamic Title
    document.title = `${project.title} - Project Details`;

    // Render Project Details Section
    const container = document.getElementById("project-details-container");
    if (container) {
        container.innerHTML = `
            <div class="project-title mb-80px">
                <h1 class="fs-80 fw-700 text-uppercase main-color">${project.title}</h1>
            </div>
            
            <div class="info-grid row mb-80px">
                <div class="col-lg-3 col-6 mb-30px">
                    <span class="fs-12 text-uppercase opacity-7">Client</span>
                    <h6 class="fs-18 mt-5px">${project.client}</h6>
                </div>
                <div class="col-lg-3 col-6 mb-30px">
                    <span class="fs-12 text-uppercase opacity-7">Date</span>
                    <h6 class="fs-18 mt-5px">${project.date}</h6>
                </div>
                <div class="col-lg-3 col-6 mb-30px">
                    <span class="fs-12 text-uppercase opacity-7">Category</span>
                    <h6 class="fs-18 mt-5px">${project.category}</h6>
                </div>
                <div class="col-lg-3 col-6 mb-30px">
                    <span class="fs-12 text-uppercase opacity-7">Service</span>
                    <h6 class="fs-18 mt-5px">${project.service}</h6>
                </div>
            </div>

            <div class="project-desc row mb-80px">
                <div class="col-lg-4">
                    <h4 class="text-uppercase main-color mb-30px">Overview</h4>
                </div>
                <div class="col-lg-8">
                    <p class="fs-18 opacity-8 mb-30px">${project.description}</p>
                    <p class="fs-15 opacity-6">We focus on building interactive layouts that emphasize quality visuals, animations, and high performance. Each element is modularized to support real-time data integrations.</p>
                </div>
            </div>

            <div class="gallery-grid row">
                ${project.gallery.map(img => `
                    <div class="col-lg-6 mb-30px">
                        <div class="imgfit border-radius-15px o-hidden h-500px">
                            <img src="${img}" class="w-100 h-100 object-fit-cover" alt="">
                        </div>
                    </div>
                `).join('\n')}
            </div>

            <div class="action-buttons text-align-center mt-50px">
                <a href="${project.liveUrl}" class="butn border-radius-5px mr-15px">
                    <span class="text">Live Demo</span>
                </a>
                <a href="${project.githubUrl}" class="butn border-radius-5px">
                    <span class="text">GitHub Link</span>
                </a>
            </div>
        `;
    }
}

async function renderBlogList() {
    const blogs = await fetchJSON("data/blogs.json");
    const container = document.getElementById("blogs-list-container");
    if (container && blogs) {
        window.allBlogs = blogs;
        window.currentBlogCategory = 'all';
        window.currentBlogSearch = '';

        window.displayBlogs = function() {
            let filtered = window.allBlogs;
            if (window.currentBlogCategory !== 'all') {
                filtered = filtered.filter(b => b.category.toLowerCase() === window.currentBlogCategory.toLowerCase());
            }
            if (window.currentBlogSearch) {
                const query = window.currentBlogSearch.toLowerCase();
                filtered = filtered.filter(b => b.title.toLowerCase().includes(query) || b.content.toLowerCase().includes(query));
            }

            if (filtered.length === 0) {
                container.innerHTML = `<h5 class="text-align-center opacity-7">No articles found matching your criteria.</h5>`;
                return;
            }

            container.innerHTML = filtered.map(blog => {
                // Parse date
                const parts = blog.date.split(' ');
                const day = parts[0] || "25";
                const month = (parts[1] || "AUG").toUpperCase();
                
                return `
                    <div class="item mb-80px">
                        <div class="fit-img h-350px border-radius-15px o-hidden">
                            <img src="${blog.image}" alt="">
                            <a href="blog-details.html?id=${blog.id}" class="date-show">
                                <div><span>${day}</span>${month}</div>
                            </a>
                        </div>
                        <div class="text">
                            <div class="info fw-300 mb-15px d-flex align-items-center">
                                <div class="sm-title-dote mr-30px">
                                    <span class="opacity-6">${blog.category}</span>
                                </div>
                                <div>
                                    <span class="fs-14 opacity-6">By : ${blog.author}</span>
                                </div>
                            </div>
                            <h5>
                                <a href="blog-details.html?id=${blog.id}">${blog.title}</a>
                            </h5>
                        </div>
                    </div>
                `;
            }).join('\n');

            // Re-apply background images if any dynamic bg-img is created
            document.querySelectorAll(".bg-img").forEach(el => {
                const bg = el.getAttribute("data-background");
                if (bg) el.style.backgroundImage = `url('${bg}')`;
            });
        };

        window.filterBlogCategory = function(cat) {
            window.currentBlogCategory = cat;
            window.displayBlogs();
            
            // Update active state in UI
            const catList = document.getElementById("categories-list");
            if (catList) {
                catList.querySelectorAll("li").forEach(li => {
                    const a = li.querySelector("a");
                    if (a) {
                        if (a.getAttribute("onclick").includes(`'${cat}'`)) {
                            a.style.color = "var(--main-color, #ff5e14)";
                            a.style.fontWeight = "bold";
                        } else {
                            a.style.color = "";
                            a.style.fontWeight = "";
                        }
                    }
                });
            }
        };

        // Bind Search Input
        const searchInput = document.getElementById("search-input");
        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                window.currentBlogSearch = e.target.value.trim();
                window.displayBlogs();
            });
        }

        // Initial Display
        window.displayBlogs();
    }
}

async function renderBlogDetails() {
    const blogs = await fetchJSON("data/blogs.json");
    const blogId = getQueryParam("id") || "1";
    const blog = blogs ? blogs.find(b => b.id === blogId) : null;

    if (!blog) {
        document.getElementById("blog-details-container").innerHTML = `<h3>Blog post not found</h3>`;
        return;
    }

    // Dynamic Title
    document.title = `${blog.title} - Journal`;

    const container = document.getElementById("blog-details-container");
    if (container) {
        container.innerHTML = `
            <div class="blog-header mb-80px">
                <div class="info fs-14 mb-20px text-uppercase d-flex align-items-center">
                    <span class="opacity-7">${blog.category}</span>
                    <span class="mr-15px ml-15px opacity-7">|</span>
                    <span class="fs-14 opacity-7">${blog.date}</span>
                    <span class="mr-15px ml-15px opacity-7">|</span>
                    <span class="fs-14 opacity-7">By ${blog.author}</span>
                </div>
                <h1 class="fs-70 fw-700 text-uppercase main-color">${blog.title}</h1>
            </div>

            <div class="blog-img mb-80px border-radius-15px o-hidden h-600px">
                <img src="${blog.image}" class="w-100 h-100 object-fit-cover" alt="">
            </div>

            <div class="blog-text row justify-content-center">
                <div class="col-lg-10">
                    <p class="fs-20 opacity-8 mb-30px">${blog.content}</p>
                    <p class="fs-16 opacity-6">For more insights, check our other journals and subscribe to stay updated with latest digital innovations, startup guidelines, design thinking, and high-performance frontend solutions.</p>
                </div>
            </div>
        `;
    }
}

// ----------------- MOCK CONTACT FORM STORAGE -----------------

function setupContactForm() {
    const form = document.getElementById("contact-form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const submitBtn = form.querySelector("button[type='submit']");
        const btnText = submitBtn ? submitBtn.querySelector(".text") : null;

        const name = form.querySelector("[name='name']").value.trim();
        const email = form.querySelector("[name='email']").value.trim();
        const subject = form.querySelector("[name='subject']").value.trim();
        const message = form.querySelector("[name='message']").value.trim();

        if (!name || !email || !message) {
            alert("Please fill in all required fields.");
            return;
        }

        // Show loading state on submission button
        if (submitBtn) {
            submitBtn.disabled = true;
            if (btnText) btnText.innerHTML = `<i class="fas fa-spinner fa-spin mr-10px"></i> Sending...`;
        }

        try {
            const response = await fetch("/api/contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, subject, message })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "Failed to submit message.");
            }

            // Create glassmorphic alert feedback
            const successAlert = document.createElement("div");
            successAlert.className = "alert alert-success mt-20px";
            successAlert.style.padding = "15px";
            successAlert.style.backgroundColor = "rgba(40, 167, 69, 0.15)";
            successAlert.style.backdropFilter = "blur(10px)";
            successAlert.style.border = "1px solid rgba(40, 167, 69, 0.3)";
            successAlert.style.color = "#28a745";
            successAlert.style.borderRadius = "5px";
            successAlert.innerHTML = `<strong>Success!</strong> Your message has been saved.`;
            
            form.appendChild(successAlert);
            form.reset();

            setTimeout(() => {
                successAlert.style.transition = "opacity 0.4s";
                successAlert.style.opacity = "0";
                setTimeout(() => successAlert.remove(), 400);
            }, 5000);

        } catch (err) {
            console.error(err);
            alert(err.message);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                if (btnText) btnText.textContent = "Send Message";
            }
        }
    });
}
