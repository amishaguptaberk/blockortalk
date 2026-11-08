'use client';

import { useEffect, useRef, useState } from 'react';
import { spriteFrames, type Folder, type Personality } from '../../lib/sprites.mjs';

/** Original opaque sprite canvases are displayed intact on a black collectible display. */
export default function SpriteScene({ paused }: { paused: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    void import('three').then(THREE => {
      if (disposed || !host.current) return;
      const parent = host.current;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
      catch { return; }
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      parent.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, .1, 100);
      scene.add(new THREE.HemisphereLight(0xfff6ee, 0xd9d2c8, 2));
      const key = new THREE.DirectionalLight(0xfff3e6, 3);
      key.position.set(-3, 5, 4); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -.0005;
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xfff0e6, 1.2); rim.position.set(4, 2, -4); scene.add(rim);
      const fill = new THREE.PointLight(0xff9a6a, 8, 12); fill.position.set(-3.2, 1.2, .6); scene.add(fill);
      const object = new THREE.Group(); scene.add(object);
      const canvas = document.createElement('canvas'); canvas.width = 340; canvas.height = 290;
      const context = canvas.getContext('2d');
      if (!context) { renderer.dispose(); renderer.domElement.remove(); return; }
      context.imageSmoothingEnabled = false; context.fillStyle = '#000'; context.fillRect(0,0,340,290);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.LinearFilter;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.9), new THREE.MeshBasicMaterial({ map:texture, toneMapped:false }));
      screen.position.set(0,0,.04); object.add(screen);
      const back = new THREE.Mesh(new THREE.BoxGeometry(3.48,2.98,.06),new THREE.MeshStandardMaterial({color:0x171717,roughness:.4,metalness:.15}));
      back.position.set(0,0,0); object.add(back);
      const ringCanvas=document.createElement('canvas');ringCanvas.width=512;ringCanvas.height=16;
      const ringContext=ringCanvas.getContext('2d');
      if(ringContext){const g=ringContext.createLinearGradient(0,0,512,0);g.addColorStop(0,'#ffb347');g.addColorStop(.4,'#ff8a3d');g.addColorStop(1,'#ff3d8b');ringContext.fillStyle=g;ringContext.fillRect(0,0,512,16);}
      const ringTexture=new THREE.CanvasTexture(ringCanvas);ringTexture.colorSpace=THREE.SRGBColorSpace;
      const trim=new THREE.Mesh(new THREE.BoxGeometry(3.48,.035,.08),new THREE.MeshBasicMaterial({map:ringTexture,toneMapped:false}));trim.position.set(0,1.49,.05);object.add(trim);
      const poses: {personality:Personality;folder:Folder}[] = [{personality:'planner',folder:'idle'},{personality:'planner',folder:'talk_standard'}];
      const images=poses.map(p=>spriteFrames(p.personality,p.folder).map(src=>{const image=new Image();image.src=src;return image;}));
      const reduced=matchMedia('(prefers-reduced-motion: reduce)');
      const still = () => paused || reduced.matches;
      let frame=0,progress=0,pointerX=0,pointerY=0,mouseX=0,mouseY=0,lastDraw='',lastTime=0,signaled=false;
      const slots=Array.from(document.querySelectorAll<HTMLElement>('[data-scene-slot]'));
      let lastWidth=0,lastHeight=0;
      const place=()=>{
        const focus=innerHeight*.5;
        const homes=slots.map((slot,index)=>({index,rect:slot.getBoundingClientRect()})).filter(home=>home.rect.width>2&&home.rect.height>2).map(home=>({
          ...home,
          seen:Math.max(0,Math.min(innerHeight,home.rect.bottom)-Math.max(0,home.rect.top)),
          mid:home.rect.top+home.rect.height/2,
        })).sort((a,b)=>b.seen-a.seen||Math.abs(a.mid-focus)-Math.abs(b.mid-focus));
        const home=homes[0];
        if(!home||home.seen<80){parent.style.visibility='hidden';return undefined;}
        const {rect}=home;
        const width=Math.min(rect.width*.92,440), height=width*290/340;
        const left=rect.left+(rect.width-width)/2, top=rect.top+(rect.height-height)/2;
        parent.style.visibility='visible';
        parent.style.transform=`translate3d(${left}px,${top}px,0)`;
        parent.style.width=`${width}px`;parent.style.height=`${height}px`;
        if(Math.abs(width-lastWidth)>1||Math.abs(height-lastHeight)>1){
          lastWidth=width;lastHeight=height;
          camera.aspect=width/Math.max(height,1);camera.updateProjectionMatrix();
          renderer.setSize(width,height);
        }
        return home.index/Math.max(1,slots.length-1);
      };
      const resize=()=>{lastWidth=0;place();};
      const pointer=(event:PointerEvent)=>{mouseX=event.clientX/innerWidth*2-1;mouseY=event.clientY/innerHeight*2-1;};
      const draw=(time:number)=>{
        if(disposed)return;
        frame=requestAnimationFrame(draw);
        if(document.hidden || time-lastTime<32)return;
        lastTime=time;
        const target=place();if(target===undefined)return;progress=still()?target:progress+(target-progress)*.1;
        pointerX+=(mouseX-pointerX)*.06;pointerY+=(mouseY-pointerY)*.06;
        const phase=progress>.45?1:0;
        const index=still()?0:Math.floor(time/125)%images[phase].length;
        const image=images[phase][index],drawKey=`${phase}/${index}`;
        if(image.complete&&image.naturalWidth&&lastDraw!==drawKey){context.drawImage(image,0,0,340,290);texture.needsUpdate=true;lastDraw=drawKey;if(!signaled){signaled=true;setReady(true);}}
        const blend=Math.min(1,progress);const ease=blend*blend*(3-2*blend);
        const distance=4.15/(camera.aspect*2*Math.tan(THREE.MathUtils.degToRad(15)));
        camera.position.set(still()?0:pointerX*.08,.15+ease*.08,distance);
        camera.lookAt(0,0,0);
        object.position.x=0;
        object.position.y=still()?0:Math.sin(time*.0014)*.015;
        object.rotation.y=-.03+ease*.04+(still()?0:pointerX*.02);
        object.rotation.z=0;
        camera.position.y-=still()?0:pointerY*.03;
        renderer.render(scene,camera);
      };
      resize();window.addEventListener('resize',resize);window.addEventListener('pointermove',pointer,{passive:true});
      frame=requestAnimationFrame(draw);
      cleanup=()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',resize);window.removeEventListener('pointermove',pointer);texture.dispose();ringTexture.dispose();scene.traverse(node=>{if(node instanceof THREE.Mesh){node.geometry.dispose();const materials=Array.isArray(node.material)?node.material:[node.material];materials.forEach(m=>m.dispose());}});renderer.dispose();renderer.domElement.remove();};
    }).catch(()=>{});
    return()=>{disposed=true;cleanup();};
  },[paused]);
  return <div ref={host} className="nova-scene" data-ready={ready} aria-hidden="true"/>;
}
