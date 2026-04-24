import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export default function LandingPage() {
  const heroRef = useRef<HTMLElement>(null);
  const mockupRef = useRef<HTMLImageElement>(null);
  
  useEffect(() => {
    // Lenis is handling scroll externally, GSAP hooks into it via App.tsx
    
    // Hero Animations
    const tl = gsap.timeline({ defaults: { ease: 'power4.out', duration: 1.2 }});
    tl.from('.hero-elem', {
      y: 40,
      opacity: 0,
      stagger: 0.1,
      delay: 0.2
    });

    // Scroll Scrubbing Apple-style
    if (mockupRef.current) {
      gsap.to(mockupRef.current, {
        scale: 1,
        y: 0,
        rotateX: 0,
        opacity: 1,
        scrollTrigger: {
          trigger: heroRef.current,
          start: 'top top',
          end: 'bottom top',
          scrub: 1,
        }
      });
    }

    // Enter cascade animations
    gsap.utils.toArray('.cascade-reveal').forEach((elem: any) => {
      gsap.from(elem, {
        y: 60,
        opacity: 0,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: elem,
          start: 'top 85%',
        }
      });
    });

    // Optional parallax
    gsap.utils.toArray('.parallax-elem').forEach((elem: any) => {
      gsap.fromTo(elem, 
        { y: -30 }, 
        { 
          y: 30, 
          ease: 'none',
          scrollTrigger: {
            trigger: elem.parentElement,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true
          }
        }
      );
    });

  }, []);

  return (
    <main className="bg-[#050505] text-[#fafafa] font-sans selection:bg-white selection:text-black">
      
      {/* HEADER */}
      <header className="fixed top-0 w-full z-40 p-6 mix-blend-difference">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="font-bold text-xl tracking-tighter">ULTRASITE</div>
          <nav className="hidden md:flex gap-8 text-sm font-medium">
            <a href="#vision" className="hover:opacity-70 transition-opacity">Vision</a>
            <a href="#creation" className="hover:opacity-70 transition-opacity">Creation</a>
            <a href="#impact" className="hover:opacity-70 transition-opacity">Impact</a>
          </nav>
          <a href="#contact" className="px-5 py-2 rounded-full border border-[rgba(255,255,255,0.2)] text-sm font-medium hover:bg-white hover:text-black transition-colors">
            Get Access
          </a>
        </div>
      </header>

      {/* HERO SECTION */}
      <section ref={heroRef} className="relative min-h-[120vh] flex flex-col items-center pt-[20vh] overflow-hidden px-4">
        <div className="max-w-5xl mx-auto text-center z-10 w-full">
          <p className="hero-elem font-medium text-[#a3a3a3] uppercase tracking-[0.2em] text-xs mb-6">Cinematic Web Architecture</p>
          <h1 className="hero-elem font-display text-5xl md:text-7xl lg:text-[7rem] font-medium leading-[1.05] tracking-tight mb-8">
            Digital presence, <br className="hidden md:block"/>
            <span className="italic text-[#888]">reimagined</span> perfectly.
          </h1>
          <p className="hero-elem text-lg md:text-xl text-[#a3a3a3] max-w-2xl mx-auto mb-12">
            A seamless scroll experience built for modern browsers. Pixel-perfect, performant, and designed at an enterprise level. Press F7 to unveil the backend.
          </p>
        </div>

        {/* 3D Mockup representation that scales into view */}
        <div className="relative w-full max-w-6xl mx-auto mt-12 z-0 perspective-[2000px]">
          <div className="w-full relative pt-[56.25%] rounded-2xl overflow-hidden border border-[rgba(255,255,255,0.1)] shadow-2xl bg-[#111]">
            <img 
              ref={mockupRef}
              src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop" 
              alt="High-end interface abstract representation"
              className="absolute inset-0 w-full h-full object-cover scale-110 opacity-60 translate-y-12 rotate-x-12"
              style={{ transformOrigin: 'top center' }}
            />
            {/* Overlay gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent opacity-80" />
          </div>
        </div>
      </section>

      {/* FEATURE CASCADE */}
      <section id="vision" className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-32 items-center">
            <div>
              <h2 className="cascade-reveal text-4xl md:text-6xl font-display leading-tight mb-8">
                Precision in <br/>every pixel.
              </h2>
              <p className="cascade-reveal text-[#a3a3a3] text-lg leading-relaxed mb-8 max-w-md">
                We believe in frictionless experiences. Using GSAP and Lenis, we construct architectures that feel remarkably fluid—giving your users the sense of touching physical reality.
              </p>
              <div className="cascade-reveal flex items-center gap-4 text-sm font-medium pb-2 border-b border-[rgba(255,255,255,0.1)] w-fit hover:pr-8 transition-all cursor-pointer">
                Discover the architecture &rarr;
              </div>
            </div>

            <div className="relative h-[60vh] w-full bg-[#111] rounded-xl overflow-hidden cascade-reveal">
               <img 
                src="https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?q=80&w=2670&auto=format&fit=crop" 
                alt="Precision architecture"
                className="parallax-elem w-full h-[120%] object-cover absolute -top-[10%]"
               />
            </div>
          </div>
        </div>
      </section>

      {/* METRICS & PROOF */}
      <section className="py-32 px-6 bg-[#111] mt-16">
        <div className="max-w-7xl mx-auto">
           <h2 className="text-center cascade-reveal text-[#a3a3a3] text-sm uppercase tracking-[0.2em] mb-20">Enterprise Performance</h2>
           
           <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {[
                { metric: "60fps", label: "Render Target" },
                { metric: "<1.5s", label: "LCP Speed" },
                { metric: "0.00", label: "Layout Shift" },
                { metric: "Awwwards", label: "Quality Grade" }
              ].map((item, i) => (
                <div key={i} className="cascade-reveal text-center flex flex-col gap-2">
                  <div className="text-4xl md:text-6xl font-display">{item.metric}</div>
                  <div className="text-sm text-[#a3a3a3] uppercase tracking-wider">{item.label}</div>
                </div>
              ))}
           </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-16 px-6 mt-32 border-t border-[rgba(255,255,255,0.05)]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="font-bold tracking-tighter">ULTRASITE</div>
          <div>teloadverti.com.mx</div>
        </div>
      </footer>
    </main>
  );
}
