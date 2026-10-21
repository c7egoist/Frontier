(function(){const i=document.createElement("link").relList;if(i&&i.supports&&i.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))e(r);new MutationObserver(r=>{for(const a of r)if(a.type==="childList")for(const l of a.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&e(l)}).observe(document,{childList:!0,subtree:!0});function t(r){const a={};return r.integrity&&(a.integrity=r.integrity),r.referrerPolicy&&(a.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?a.credentials="include":r.crossOrigin==="anonymous"?a.credentials="omit":a.credentials="same-origin",a}function e(r){if(r.ep)return;r.ep=!0;const a=t(r);fetch(r.href,a)}})();const g=c=>document.querySelector(c),N=c=>String(c).replace(/[&<>"']/g,i=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[i]),O=["Parameters","Camera","Engine","Canvas","Names","Selection","Tab","Preset","Dirty","Bursts","SavedCollider","SavedSun","Backend"];class ie{constructor(i,t){this.Editor=i,this.Icon=t,this.NextIdentity=2,this.ActiveIdentity=1,this.Slots=[{Identity:1,Name:g("#document-name").value,State:null}],this.ConstructTabs(),g("#new-document").addEventListener("click",()=>this.OpenDocument()),g("#document-tabs").addEventListener("click",e=>{const r=e.target.closest("[data-close-document]");if(r){this.CloseDocument(Number(r.dataset.closeDocument));return}if(e.target.matches("input"))return;const a=e.target.closest("[data-document]");a&&this.ActivateDocument(Number(a.dataset.document))}),g("#document-tabs").addEventListener("dblclick",e=>{if(e.target.closest("[data-close-document]"))return;const r=e.target.closest("[data-document]");if(!r||Number(r.dataset.document)!==this.ActiveIdentity)return;const a=r.querySelector("input");a.hidden=!1,r.querySelector(".document-label").hidden=!0,a.value=this.Slots.find(l=>l.Identity===this.ActiveIdentity).Name,a.focus(),a.select()}),g("#document-tabs").addEventListener("focusout",e=>{e.target.matches(".document-rename")&&!e.target.hidden&&this.RenameDocument(e.target)}),g("#document-tabs").addEventListener("keydown",e=>{if(e.target.matches("input")){e.key==="Enter"&&(e.preventDefault(),this.RenameDocument(e.target)),e.key==="Escape"&&(e.preventDefault(),e.target.hidden=!0,e.target.parentElement.querySelector(".document-label").hidden=!1,e.target.parentElement.focus()),e.stopPropagation();return}const r=e.target.closest("[data-document]");if(r&&(e.key==="Enter"||e.key===" ")&&(e.preventDefault(),e.stopPropagation(),this.ActivateDocument(Number(r.dataset.document))),r&&["ArrowLeft","ArrowRight"].includes(e.key)){e.preventDefault(),e.stopPropagation();const a=this.Slots.findIndex(n=>n.Identity===Number(r.dataset.document)),l=this.Slots[(a+(e.key==="ArrowRight"?1:this.Slots.length-1))%this.Slots.length];this.ActivateDocument(l.Identity),g(`[data-document="${l.Identity}"]`).focus()}})}CaptureDocument(){const i=this.Slots.find(t=>t.Identity===this.ActiveIdentity);return i.Name=g("#document-name").value.trim()||"Untitled",this.Editor.Engine?.setBrush(null,null,!1),i.State=Object.fromEntries(O.map(t=>[t,this.Editor[t]])),i.State.CameraView=g("#camera-view").value,i.State.BurstKind=g("#burst-kind").value,i.State.Fault=g("#gpu-error").hidden?"":g("#gpu-error-message").textContent,i}RefreshLabels(){const i=this.Slots.find(t=>t.Identity===this.ActiveIdentity);if(i){i.Name=g("#document-name").value.trim()||"Untitled";for(const t of this.Slots){const e=g(`[data-document="${t.Identity}"]`);if(!e)continue;const r=t.Identity===this.ActiveIdentity;e.setAttribute("aria-selected",String(r)),e.classList.toggle("active",r),e.querySelector(".document-label").textContent=`${t.Name}.fluid`,e.querySelector(".tab-dirty").hidden=!(r?this.Editor.Dirty:t.State?.Dirty),e.title=`${t.Name}.fluid · Double-click to rename${r?"":" · Simulation held while inactive"}`}}}ConstructTabs(){g("#document-tabs").innerHTML=this.Slots.map(i=>`<div class="document-tab" role="tab" aria-controls="fluid-workspace" aria-selected="${i.Identity===this.ActiveIdentity}" tabindex="0" data-document="${i.Identity}">${this.Icon("flame")}<span class="document-label">${N(i.Name)}.fluid</span><input class="document-rename" aria-label="Rename document" maxlength="64" hidden/><span class="tab-dirty" hidden></span><button class="tab-close" data-close-document="${i.Identity}" aria-label="Close ${N(i.Name)}" title="Close document" ${this.Slots.length===1?"disabled":""}>${this.Icon("close")}</button></div>`).join(""),this.RefreshLabels()}RenameDocument(i){const t=i.value.trim()||"Untitled";i.hidden=!0,i.parentElement.querySelector(".document-label").hidden=!1,g("#document-name").value=t,this.Editor.MarkDirty(),this.RefreshLabels(),i.parentElement.focus()}async OpenDocument(){if(!(this.Editor.Switching||this.Editor.Baking)){if(this.Slots.length>=4){this.Editor.Notify("Four live documents maximum to bound GPU memory. Save and close a tab before adding another.");return}this.Slots.push({Identity:this.NextIdentity++,Name:`Untitled ${this.NextIdentity-2}`,State:null}),this.ConstructTabs(),await this.ActivateDocument(this.Slots.at(-1).Identity)}}async ActivateDocument(i){if(i===this.ActiveIdentity||this.Editor.Switching||this.Editor.Baking)return;const t=this.Slots.find(r=>r.Identity===i);if(!t)return;this.CaptureDocument();const e=this.Editor.Canvas;if(this.ActiveIdentity=i,g("#document-name").value=t.Name,t.State){for(const r of O)this.Editor[r]=t.State[r];e.replaceWith(this.Editor.Canvas),g("#camera-view").value=t.State.CameraView,g("#burst-kind").value=t.State.BurstKind,g("#gpu-error").hidden=!t.State.Fault,g("#gpu-error-message").textContent=t.State.Fault}else this.Editor.InitializeDocumentState(),this.Editor.Canvas=e.cloneNode(!1),e.replaceWith(this.Editor.Canvas),this.Editor.Engine=null,await this.Editor.InitializeRenderer("webgl2"),g("#camera-view").value="perspective",g("#burst-kind").value="burst";g("#document-name").value=t.Name,g("#backend-select").value=this.Editor.Backend||"webgl2",g("#status-ready").textContent=this.Editor.Engine?"GPU ready":"GPU unavailable",g("#viewport-subtitle").textContent=this.Editor.Backend==="webgpu"?"Experimental gas path · WebGL2 provides full effects":"Eulerian volume · physically shaded",this.Editor.SingleStep=!1,this.Editor.LastTime=performance.now(),this.Editor.Elapsed=0,this.Editor.Frames=0,this.Editor.SceneFilter="all",g("#scene-search").value="",g("#collection-toggle").setAttribute("aria-expanded","true"),this.Editor.ResizeViewport(),this.Editor.ConstructSceneRows(),this.Editor.ConstructInspector(),this.Editor.ConstructPresetCards(),this.Editor.RefreshControls(),this.RefreshLabels(),this.Editor.Engine?.gl?.isContextLost()&&this.Editor.ShowGpuError("This document lost its GPU context. Retry to rebuild it from the saved settings.")}async CloseDocument(i){if(this.Slots.length===1||this.Editor.Switching||this.Editor.Baking)return;const t=this.Slots.find(r=>r.Identity===i);!t||(i===this.ActiveIdentity?this.Editor.Dirty:t.State?.Dirty)&&!window.confirm(`Close “${t.Name}” and discard its unsaved settings?`)||(i===this.ActiveIdentity&&await this.ActivateDocument(this.Slots.find(r=>r!==t).Identity),t.State?.Engine?.destroy(),t.State?.Engine?.gl?.getExtension("WEBGL_lose_context")?.loseContext(),this.Slots=this.Slots.filter(r=>r!==t),this.ConstructTabs())}}const _=[{value:16,label:"16³",tilesX:4,tilesY:4},{value:24,label:"24³",tilesX:6,tilesY:4},{value:32,label:"32³",tilesX:8,tilesY:4},{value:48,label:"48³",tilesX:8,tilesY:6},{value:64,label:"64³",tilesX:8,tilesY:8},{value:96,label:"96³",tilesX:12,tilesY:8},{value:128,label:"128³",tilesX:16,tilesY:8}],re=[{id:0,label:"Lit volume"},{id:1,label:"Voxel DDA"},{id:2,label:"Smoke density"},{id:3,label:"Temperature"},{id:4,label:"Fuel"},{id:5,label:"Velocity"},{id:6,label:"Vorticity"},{id:7,label:"Pressure / irradiance"},{id:8,label:"Cross-section"}],ae=[{id:0,label:"None"},{id:1,label:"Sphere"},{id:2,label:"Vertical cylinder"},{id:3,label:"Horizontal cylinder"},{id:4,label:"Deflector slab"},{id:5,label:"Tyre ring"}],L={gridResolution:64,pressureIterations:22,timeScale:1,paused:!1,macCormackAdvection:!0,enclosedBox:!1,voxelQuantization:0,autoGpuGovernor:!1,boundsWidth:1.85,boundsHeight:2.1,dynamicBounds:!0,dynamicBoundsMax:1.55,interactionMode:"orbit",autoTurntable:!1,vorticityConfinement:7.8,buoyancy:5.8,smokeWeight:1.15,burnRate:1.85,burnHeat:2.6,sootGeneration:1.55,combustionExpansion:4.4,coolingRate:1.35,smokeDissipation:.18,velocityDamping:.07,turbulenceStrength:3.5,turbulenceScale:3.8,windX:.22,windZ:0,emitterEnabled:!0,emitterRate:1,emitterRadius:.1,emitterHeight:.07,emitterUpwardVelocity:3.2,emitterSwirl:1.2,emitterTemperature:3.5,emitterFuel:2.8,emitterSmoke:1.4,blastStrength:9.8,blastRadius:.18,blastTemperature:5.4,blastFuel:4.6,blastSmoke:2.6,blastLobes:6,shrapnelEnabled:!0,renderChannel:0,colorPalette:0,renderScale:1,raymarchSteps:96,shadowSteps:6,densityExtinction:18.5,smokeAlbedo:.22,shadowDensity:11.5,fireIntensity:5.6,temperatureScale:1.15,internalScattering:2.5,phaseAnisotropy:.38,ambientIntensity:.35,sunIntensity:2.2,sunAzimuth:42,sunElevation:52,exposure:1.25,bloomIntensity:.55,godRaysIntensity:.45,shockwaveStrength:1,sliceAxis:2,slicePosition:.5,obstacleType:0,obstacleX:.5,obstacleY:.26,obstacleZ:.5,obstacleRadius:.16,colliderAutoMove:!0,colliderSpeed:1.25,showBoundingBox:!0,showVoxelGridLines:!0,showActiveVoxelCells:!1,showFloorGrid:!0,showEmbers:!0,emberCount:550,emberSize:1,emberIntensity:1.4,emberLifetime:1,emberAshiness:0,showAtlasMinimap:!0,atlasMinimapField:0},B={ue5_pyro_default:{name:"UE5 Niagara Pyro Plume + Blast",description:"Balanced hydrocarbon fireball with dynamic expanding bounds, ballistic shrapnel trails, and rolling dark soot.",triggerExplosionOnLoad:!0,params:{gridResolution:96,blastRadius:.13,boundsWidth:2.6,boundsHeight:2.95,dynamicBounds:!0,dynamicBoundsMax:1.2,shrapnelEnabled:!0,voxelQuantization:0,raymarchSteps:120,renderChannel:0,colorPalette:0,vorticityConfinement:7.8,buoyancy:5.8,smokeWeight:1.15,burnRate:1.85,burnHeat:2.6,sootGeneration:1.55,combustionExpansion:4.4,coolingRate:1.35,smokeDissipation:.18,turbulenceStrength:3.5,emitterEnabled:!0,emitterRate:1,emitterRadius:.1,emitterUpwardVelocity:3.2,emitterSwirl:1.2,emitterTemperature:3.5,emitterFuel:2.8,emitterSmoke:1.4,densityExtinction:18.5,smokeAlbedo:.22,fireIntensity:5.6,internalScattering:2.5,godRaysIntensity:.45,obstacleType:0,showEmbers:!0,showActiveVoxelCells:!1}},shrapnel_airburst:{name:"Ordnance Shrapnel Airburst",description:"High-explosive airburst ejecting 6 burning ballistic shrapnel fragments that arc through the 3D volume leaving smoke streamers.",triggerExplosionOnLoad:!0,params:{gridResolution:96,boundsWidth:3.3,boundsHeight:3.45,dynamicBounds:!0,dynamicBoundsMax:1.2,shrapnelEnabled:!0,emitterEnabled:!1,colorPalette:0,vorticityConfinement:8.8,buoyancy:5.2,smokeDissipation:.12,blastStrength:11.5,blastRadius:.14,blastTemperature:6.2,godRaysIntensity:.65,obstacleType:0,showEmbers:!0,showActiveVoxelCells:!1}},megaton_open_bounds:{name:"Megaton Wide-Bounds Blast",description:"Extra-large 3.0x simulation bounds with dynamic surge expansion so massive explosions and salvos have full room to mushroom.",triggerExplosionOnLoad:!0,params:{gridResolution:128,boundsWidth:3.9,boundsHeight:4,dynamicBounds:!0,dynamicBoundsMax:1.2,shrapnelEnabled:!0,voxelQuantization:0,raymarchSteps:120,renderChannel:0,colorPalette:0,vorticityConfinement:9.2,buoyancy:6.2,smokeWeight:1.2,burnRate:1.75,burnHeat:3,sootGeneration:1.9,combustionExpansion:5.8,coolingRate:1.2,smokeDissipation:.11,turbulenceStrength:4.5,emitterEnabled:!1,blastStrength:13.5,blastRadius:.13,blastTemperature:6.5,blastFuel:5.4,blastSmoke:3,densityExtinction:20,smokeAlbedo:.26,fireIntensity:6.5,internalScattering:3,obstacleType:0,showEmbers:!0,showActiveVoxelCells:!1}},low_gpu_performance:{name:"Low-End GPU Fast Mode",description:"Ultra-lightweight 24³ voxel grid (13.8K voxels) + 56 raymarch steps for reduced GPU cost; performance depends on the device.",triggerExplosionOnLoad:!0,params:{gridResolution:24,boundsWidth:2,boundsHeight:2.2,dynamicBounds:!0,pressureIterations:14,raymarchSteps:56,shadowSteps:4,renderScale:.85,voxelQuantization:0,renderChannel:0,vorticityConfinement:8.5,buoyancy:6,showActiveVoxelCells:!1}},tactical_ordnance:{name:"Tactical C4 / HE Blast Wave",description:"High-explosive shockwave detonation with rapid divergence expansion, blinding flash core, and billowing dust/soot cloud.",triggerExplosionOnLoad:!0,params:{gridResolution:96,boundsWidth:3.05,boundsHeight:3.25,dynamicBounds:!0,dynamicBoundsMax:1.2,shrapnelEnabled:!0,voxelQuantization:0,raymarchSteps:120,renderChannel:0,colorPalette:2,vorticityConfinement:9.2,buoyancy:4.6,smokeWeight:1.3,burnRate:2.6,burnHeat:3.2,sootGeneration:2.1,combustionExpansion:6.5,coolingRate:1.75,smokeDissipation:.14,turbulenceStrength:4.8,emitterEnabled:!1,blastStrength:12.5,blastRadius:.15,blastTemperature:6.4,blastFuel:5.2,blastSmoke:3.2,densityExtinction:22,smokeAlbedo:.34,fireIntensity:6.8,internalScattering:3.1,obstacleType:0,showEmbers:!0,showActiveVoxelCells:!1}},oil_well_inferno:{name:"Raging Oil Well Inferno",description:"High-velocity pressurized fuel blowout generating a roaring flame column and dense carbonaceous black smoke.",triggerExplosionOnLoad:!1,params:{boundsWidth:1.9,boundsHeight:2.4,dynamicBounds:!0,voxelQuantization:0,renderChannel:0,colorPalette:1,vorticityConfinement:8.8,buoyancy:7.2,smokeWeight:1.4,burnRate:1.6,burnHeat:3.1,sootGeneration:2.2,combustionExpansion:3.4,coolingRate:1.15,smokeDissipation:.22,turbulenceStrength:4.2,windX:.65,emitterEnabled:!0,emitterRate:1.45,emitterRadius:.11,emitterUpwardVelocity:5.4,emitterSwirl:1.8,emitterTemperature:4.2,emitterFuel:3.6,emitterSmoke:1.9,densityExtinction:24,smokeAlbedo:.12,fireIntensity:6,internalScattering:2.8,obstacleType:0,showEmbers:!0,showActiveVoxelCells:!1}},obstacle_deflection:{name:"Voxel Collider Flow Deflection",description:"Demonstrates a 3D solid sphere collider inside the Eulerian grid—fire and smoke split and curl around the obstacle.",triggerExplosionOnLoad:!0,params:{boundsWidth:1.85,boundsHeight:2.1,colorPalette:0,vorticityConfinement:8.4,buoyancy:6.4,burnRate:1.75,combustionExpansion:3.8,coolingRate:1.2,smokeDissipation:.18,emitterEnabled:!0,emitterRate:1.25,emitterRadius:.11,emitterUpwardVelocity:4.6,obstacleType:1,obstacleX:.5,obstacleY:.42,obstacleZ:.5,obstacleRadius:.16,showActiveVoxelCells:!1}},wildfire_tornado:{name:"Fire Tornado / Alchemical Vortex",description:"High-swirl fire tornado with copper-emerald blackbody radiation and intense rotational vorticity.",triggerExplosionOnLoad:!0,params:{boundsWidth:1.9,boundsHeight:2.3,colorPalette:3,vorticityConfinement:9.5,buoyancy:6.8,burnRate:1.7,combustionExpansion:3.5,coolingRate:1.25,smokeDissipation:.2,turbulenceStrength:3.8,emitterEnabled:!0,emitterRate:1.3,emitterRadius:.12,emitterUpwardVelocity:4.2,emitterSwirl:5.5,emitterTemperature:3.9,emitterFuel:3.2,obstacleType:0,showActiveVoxelCells:!1}},ashfall_motes:{name:"Ashfall / Grey Fireflies",description:"A cooling afterburn cloud with dense grey ash motes instead of orange sparks—use the ember sliders to tune size, brightness, lifetime, and ashiness.",triggerExplosionOnLoad:!0,params:{emitterEnabled:!1,blastStrength:7,blastRadius:.2,blastTemperature:2.4,blastFuel:1.2,blastSmoke:3.8,colorPalette:1,smokeDissipation:.08,showEmbers:!0,emberCount:900,emberSize:1.25,emberIntensity:.95,emberLifetime:1.65,emberAshiness:1,showActiveVoxelCells:!1}},voxelized_stylized:{name:"Voxelized Stylized Grid",description:"Explicit voxelized resolution look showing discrete 3D grid cells with quantized volumetric shading.",triggerExplosionOnLoad:!0,params:{voxelQuantization:.88,renderChannel:1,vorticityConfinement:8,showActiveVoxelCells:!0}},dust_tornado:{name:"Dust Tornado / Debris Vortex",description:"A cold ground-up vortex with no fuel at all: heavy dust held in a tall swirling column by strong vorticity and almost no buoyancy.",triggerExplosionOnLoad:!1,params:{gridResolution:96,boundsWidth:2.2,boundsHeight:3.6,dynamicBounds:!1,colorPalette:1,vorticityConfinement:11.5,buoyancy:1.3,smokeWeight:1.9,burnRate:.2,burnHeat:.5,sootGeneration:.2,combustionExpansion:0,coolingRate:3.2,smokeDissipation:.05,velocityDamping:.03,turbulenceStrength:2.6,turbulenceScale:2.4,windX:.12,emitterEnabled:!0,emitterRate:1.6,emitterRadius:.09,emitterHeight:.04,emitterUpwardVelocity:2.6,emitterSwirl:7.6,emitterTemperature:.3,emitterFuel:0,emitterSmoke:3.4,blastFuel:0,blastTemperature:2,blastSmoke:5.5,densityExtinction:15,smokeAlbedo:.62,shadowDensity:7,fireIntensity:.5,internalScattering:1.2,phaseAnisotropy:.1,obstacleType:0,showEmbers:!0,emberCount:700,emberSize:.6,emberIntensity:.35,emberLifetime:2.4,emberAshiness:1,showActiveVoxelCells:!1}},tyre_burnout:{name:"Tyre Burnout",description:"Hot rubber smoke off a spinning tyre: the ring collider sits in the grid, the source is flat on the floor, and the cloud is dragged sideways instead of climbing.",triggerExplosionOnLoad:!1,params:{gridResolution:96,boundsWidth:2.6,boundsHeight:1.7,dynamicBounds:!1,colorPalette:1,vorticityConfinement:6.4,buoyancy:2.3,smokeWeight:1.25,burnRate:.4,burnHeat:.8,sootGeneration:3.4,combustionExpansion:.4,coolingRate:2.6,smokeDissipation:.07,velocityDamping:.05,turbulenceStrength:3.4,turbulenceScale:4.2,windX:1.15,windZ:-.35,emitterEnabled:!0,emitterRate:1.9,emitterRadius:.13,emitterHeight:.02,emitterUpwardVelocity:1.4,emitterSwirl:3.2,emitterTemperature:.9,emitterFuel:.2,emitterSmoke:4.2,blastFuel:0,blastTemperature:2,blastSmoke:5.5,densityExtinction:27,smokeAlbedo:.17,shadowDensity:14,fireIntensity:.8,internalScattering:.9,obstacleType:5,obstacleX:.5,obstacleY:.26,obstacleZ:.5,obstacleRadius:.17,colliderAutoMove:!1,showEmbers:!1,showActiveVoxelCells:!1}},ledge_sandfall:{name:"Sand Falling From A Ledge",description:"Dry sand poured off a slab: the source sits high, smoke weight beats buoyancy so the column falls, and bright grains settle out of the base.",triggerExplosionOnLoad:!1,params:{gridResolution:96,boundsWidth:1.9,boundsHeight:2.8,dynamicBounds:!1,colorPalette:1,vorticityConfinement:3.6,buoyancy:.2,smokeWeight:3.2,burnRate:.2,burnHeat:.5,sootGeneration:.2,combustionExpansion:0,coolingRate:3.5,smokeDissipation:.06,velocityDamping:.02,turbulenceStrength:1.4,turbulenceScale:5.5,windX:.18,emitterEnabled:!0,emitterRate:1.35,emitterRadius:.07,emitterHeight:.92,emitterUpwardVelocity:.5,emitterSwirl:.4,emitterTemperature:.2,emitterFuel:0,emitterSmoke:3.8,blastFuel:0,blastTemperature:2,blastSmoke:5.5,densityExtinction:13,smokeAlbedo:.74,shadowDensity:6,fireIntensity:.5,internalScattering:1.6,phaseAnisotropy:.22,obstacleType:4,obstacleX:.5,obstacleY:.62,obstacleZ:.5,obstacleRadius:.2,colliderAutoMove:!1,showEmbers:!0,emberCount:850,emberSize:.5,emberIntensity:.3,emberLifetime:1.3,emberAshiness:1,showActiveVoxelCells:!1}},settling_dust:{name:"Settling Dust",description:"The quiet aftermath: a slow pale cloud that hangs, drifts on a light crosswind and sinks rather than rises. No fire anywhere in it.",triggerExplosionOnLoad:!1,params:{gridResolution:64,boundsWidth:2.3,boundsHeight:1.8,dynamicBounds:!1,colorPalette:1,vorticityConfinement:2.8,buoyancy:.6,smokeWeight:2.4,burnRate:.2,burnHeat:.5,sootGeneration:.2,combustionExpansion:0,coolingRate:3.5,smokeDissipation:.04,velocityDamping:.12,turbulenceStrength:1.2,turbulenceScale:2.8,windX:.38,emitterEnabled:!0,emitterRate:.6,emitterRadius:.18,emitterHeight:.1,emitterUpwardVelocity:.8,emitterSwirl:.6,emitterTemperature:.2,emitterFuel:0,emitterSmoke:2.4,blastFuel:0,blastTemperature:2,blastSmoke:5.5,densityExtinction:11,smokeAlbedo:.68,shadowDensity:5,fireIntensity:.5,internalScattering:1.8,phaseAnisotropy:.18,obstacleType:0,showEmbers:!1,showActiveVoxelCells:!1}},small_gust:{name:"Small Gust / Drifting Haze",description:"A thin sheet of haze pushed across the domain by a steady crosswind and torn apart by fine turbulence. Cheap enough to leave running.",triggerExplosionOnLoad:!1,params:{gridResolution:48,boundsWidth:2.5,boundsHeight:1.5,dynamicBounds:!1,colorPalette:1,vorticityConfinement:4.2,buoyancy:1.1,smokeWeight:.35,burnRate:.2,burnHeat:.5,sootGeneration:.2,combustionExpansion:0,coolingRate:3,smokeDissipation:.42,velocityDamping:.04,turbulenceStrength:2.4,turbulenceScale:6.8,windX:1.75,windZ:.55,emitterEnabled:!0,emitterRate:.45,emitterRadius:.12,emitterHeight:.22,emitterUpwardVelocity:.9,emitterSwirl:.9,emitterTemperature:.2,emitterFuel:0,emitterSmoke:1.1,raymarchSteps:64,blastFuel:0,blastTemperature:2,blastSmoke:5.5,densityExtinction:7,smokeAlbedo:.6,shadowDensity:4,fireIntensity:.5,internalScattering:1.4,obstacleType:0,showEmbers:!1,showActiveVoxelCells:!1}},brick_fracture_dust:{name:"Fractured Brick Burst",description:"Masonry breaking: a cold burst with no fuel and a great deal of smoke, throwing heavy chips off a slab. This is the shape a fracture event should spawn.",triggerExplosionOnLoad:!0,params:{gridResolution:96,boundsWidth:2.4,boundsHeight:2.2,dynamicBounds:!0,dynamicBoundsMax:1.2,shrapnelEnabled:!0,colorPalette:1,vorticityConfinement:6.8,buoyancy:.9,smokeWeight:2.1,burnRate:.2,burnHeat:.5,sootGeneration:.2,combustionExpansion:.2,coolingRate:3.4,smokeDissipation:.07,turbulenceStrength:4.4,turbulenceScale:3.2,emitterEnabled:!1,emitterFuel:0,emitterTemperature:.2,blastStrength:8.5,blastRadius:.11,blastTemperature:2,blastFuel:0,blastSmoke:6.5,blastLobes:9,raymarchSteps:110,densityExtinction:26,smokeAlbedo:.56,shadowDensity:12,fireIntensity:.5,internalScattering:1.1,obstacleType:4,obstacleX:.5,obstacleY:.3,obstacleZ:.5,obstacleRadius:.22,colliderAutoMove:!1,showEmbers:!0,emberCount:820,emberSize:1.45,emberIntensity:.4,emberLifetime:1.1,emberAshiness:1,showActiveVoxelCells:!1}},lantern_flame:{name:"Lantern / Oil Lamp Flame",description:"One small steady wick in a tight domain. The box is the smallest the editor allows, so a 96 grid spends every voxel on the flame itself.",triggerExplosionOnLoad:!1,params:{gridResolution:96,boundsWidth:1,boundsHeight:1.3,dynamicBounds:!1,colorPalette:0,pressureIterations:26,vorticityConfinement:3.4,buoyancy:3.8,smokeWeight:.6,burnRate:1.15,burnHeat:2.2,sootGeneration:.3,combustionExpansion:1.6,coolingRate:1.9,smokeDissipation:.82,velocityDamping:.1,turbulenceStrength:.85,turbulenceScale:7.5,windX:.06,emitterEnabled:!0,emitterRate:.4,emitterRadius:.05,emitterHeight:.02,emitterUpwardVelocity:1.2,emitterSwirl:.5,emitterTemperature:3.2,emitterFuel:2.4,emitterSmoke:.3,raymarchSteps:128,densityExtinction:12,smokeAlbedo:.3,fireIntensity:4.2,temperatureScale:1.05,internalScattering:2.2,ambientIntensity:.18,sunIntensity:.9,exposure:1.05,bloomIntensity:.7,godRaysIntensity:.25,obstacleType:0,showEmbers:!1,showActiveVoxelCells:!1}},camp_fire:{name:"Camp Fire",description:"A wood fire in the open: a broad low base, a lazy lean on the breeze, rising sparks and a thin pale smoke rather than a black one.",triggerExplosionOnLoad:!1,params:{gridResolution:64,boundsWidth:1.6,boundsHeight:2.2,dynamicBounds:!1,colorPalette:0,vorticityConfinement:7.4,buoyancy:5.2,smokeWeight:.85,burnRate:1.5,burnHeat:2.4,sootGeneration:1.05,combustionExpansion:2.8,coolingRate:1.55,smokeDissipation:.34,velocityDamping:.06,turbulenceStrength:3,turbulenceScale:4.6,windX:.32,emitterEnabled:!0,emitterRate:.95,emitterRadius:.15,emitterHeight:.05,emitterUpwardVelocity:2.5,emitterSwirl:1.7,emitterTemperature:3.1,emitterFuel:2.3,emitterSmoke:.95,densityExtinction:14,smokeAlbedo:.38,fireIntensity:4.8,internalScattering:2.4,ambientIntensity:.22,sunIntensity:1.2,obstacleType:0,showEmbers:!0,emberCount:430,emberSize:.8,emberIntensity:1.6,emberLifetime:1.9,emberAshiness:.25,showActiveVoxelCells:!1}}},se=[{tab:"tab-grid",title:"Dynamic World Bounds",badge:"ADAPTIVE",controls:[{type:"toggle",key:"dynamicBounds",label:"Dynamic Auto-Expanding Blast Bounds"},{type:"range",key:"boundsWidth",label:"Base Bounds Width X / Z",min:1,max:4,step:.05},{type:"range",key:"boundsHeight",label:"Base Bounds Height Y",min:1.2,max:4,step:.05},{type:"range",key:"dynamicBoundsMax",label:"Dynamic Blast Surge Multiplier",min:1.1,max:2.2,step:.05}]},{tab:"tab-grid",title:"3D Voxel Grid Resolution",badge:"EULERIAN",controls:[{type:"select",key:"gridResolution",label:"Voxel Domain Dimensions",options:[{value:16,label:"16³",tilesX:4,tilesY:4},{value:24,label:"24³",tilesX:6,tilesY:4},{value:32,label:"32³",tilesX:8,tilesY:4},{value:48,label:"48³",tilesX:8,tilesY:6},{value:64,label:"64³",tilesX:8,tilesY:8},{value:96,label:"96³",tilesX:12,tilesY:8},{value:128,label:"128³",tilesX:16,tilesY:8}]},{type:"range",key:"voxelQuantization",label:"Voxel Quantization",min:0,max:1,step:.01},{type:"toggle",key:"autoGpuGovernor",label:"Auto Low-End GPU FPS Governor"},{type:"toggle",key:"showActiveVoxelCells",label:"UE5 Sparse Voxel Octree Wireframe"},{type:"toggle",key:"showAtlasMinimap",label:"Show Live 2D Tiled 3D Voxel Atlas PiP"},{type:"select",key:"atlasMinimapField",label:"Voxel Atlas Minimap Channel",options:[{id:0,label:"State Atlas"},{id:1,label:"Velocity Atlas"},{id:2,label:"Vorticity Curl Atlas"},{id:3,label:"Pressure & 3D Irradiance Atlas"}]}]},{tab:"tab-grid",title:"Navier-Stokes Pressure Solver",badge:"POISSON",controls:[{type:"range",key:"pressureIterations",label:"Jacobi Pressure + Irradiance Iterations",min:6,max:48,step:2},{type:"range",key:"timeScale",label:"Simulation Time Scale",min:.1,max:2,step:.05},{type:"toggle",key:"macCormackAdvection",label:"MacCormack / BFECC Sharp Advection"},{type:"toggle",key:"enclosedBox",label:"Closed Top/Side Domain Walls"}]},{tab:"tab-grid",title:"3D Grid Cross-Section Slice",badge:"DEBUG",controls:[{type:"select",key:"sliceAxis",label:"Slice Plane Axis",options:[{id:0,label:"X-Axis Slice"},{id:1,label:"Y-Axis Slice"},{id:2,label:"Z-Axis Slice"}]},{type:"range",key:"slicePosition",label:"Slice Plane Depth",min:.05,max:.95,step:.01}]},{tab:"tab-pyro",title:"Vorticity & Buoyancy Forces",badge:"TURBULENCE",controls:[{type:"range",key:"vorticityConfinement",label:"Vorticity Confinement",min:0,max:14,step:.1},{type:"range",key:"buoyancy",label:"Thermal Buoyancy Lift",min:0,max:12,step:.1},{type:"range",key:"smokeWeight",label:"Soot Weight / Downward Drag",min:0,max:3.5,step:.05},{type:"range",key:"turbulenceStrength",label:"Sub-Grid Curl Noise Injection",min:0,max:8,step:.1},{type:"range",key:"turbulenceScale",label:"Turbulence Noise Frequency",min:1,max:10,step:.1}]},{tab:"tab-pyro",title:"Combustion & Thermodynamics",badge:"EXOTHERMIC",controls:[{type:"range",key:"burnRate",label:"Fuel Reaction / Burn Speed",min:.2,max:4.5,step:.05},{type:"range",key:"burnHeat",label:"Exothermic Heat Release",min:.5,max:5,step:.05},{type:"range",key:"sootGeneration",label:"Combustion Soot / Smoke Yield",min:.2,max:4,step:.05},{type:"range",key:"combustionExpansion",label:"Gas Divergence Expansion",min:0,max:10,step:.1},{type:"range",key:"coolingRate",label:"Stefan-Boltzmann Radiative Cooling",min:.2,max:3.5,step:.05},{type:"range",key:"smokeDissipation",label:"Smoke Dissipation Rate",min:.02,max:1.2,step:.02},{type:"range",key:"windX",label:"Crosswind Force X",min:-2.5,max:2.5,step:.05}]},{tab:"tab-raymarch",title:"Volumetric Raymarcher",badge:"PARTICIPATING MEDIA",controls:[{type:"select",key:"renderChannel",label:"Render Mode / Diagnostic Field",options:[{id:0,label:"Combined Lit"},{id:1,label:"Voxelized DDA Cubes"},{id:2,label:"Primary Density ρ"},{id:3,label:"Temperature T"},{id:4,label:"Fuel Core f"},{id:5,label:"3D Velocity Vectors u"},{id:6,label:"Vorticity / Curl Magnitude |∇×u|"},{id:7,label:"Poisson Pressure & Irradiance p"},{id:8,label:"3D Grid Cross-Section Slice Inspector"}]},{type:"select",key:"colorPalette",label:"Blackbody Radiation Palette",options:[{id:0,label:"Physical Planckian Blackbody"},{id:1,label:"Cinema Napalm / Rich Hydrocarbon"},{id:2,label:"Thermobaric White-Hot Ordnance"},{id:3,label:"Wildfire / Copper Emerald Flame"},{id:4,label:"Cherenkov Blue Plasma Core"},{id:5,label:"Arcane Void Magenta / Corrupt Pyro"}]},{type:"range",key:"raymarchSteps",label:"Primary Raymarch Steps",min:32,max:160,step:4},{type:"range",key:"shadowSteps",label:"Self-Shadow Light March Steps",min:3,max:12,step:1},{type:"range",key:"renderScale",label:"Viewport Render Resolution Scale",min:.5,max:1.25,step:.05}]},{tab:"tab-raymarch",title:"Pyro Emission & Scattering",badge:"BLACKBODY",controls:[{type:"range",key:"fireIntensity",label:"Blackbody Fire Core Intensity",min:.5,max:12,step:.1},{type:"range",key:"bloomIntensity",label:"3D Volumetric Fire Bloom / Glare",min:0,max:2,step:.05},{type:"range",key:"godRaysIntensity",label:"Crepuscular God-Ray Sun Shafts",min:0,max:1.5,step:.05},{type:"range",key:"shockwaveStrength",label:"Supersonic Blast Refraction Wave",min:0,max:2,step:.05},{type:"range",key:"temperatureScale",label:"Kelvin Temperature LUT Scale",min:.4,max:2.2,step:.05},{type:"range",key:"internalScattering",label:"3D Internal Fire → Smoke Glow",min:0,max:6,step:.1},{type:"range",key:"densityExtinction",label:"Smoke Optical Extinction",min:4,max:40,step:.5},{type:"range",key:"smokeAlbedo",label:"Smoke Scattering Albedo",min:.04,max:.9,step:.01},{type:"range",key:"shadowDensity",label:"Self-Shadow Optical Thickness",min:2,max:25,step:.5},{type:"range",key:"phaseAnisotropy",label:"Henyey-Greenstein Silver-Lining",min:-.5,max:.85,step:.02},{type:"range",key:"sunElevation",label:"Directional Sun Elevation",min:10,max:88,step:1},{type:"range",key:"sunAzimuth",label:"Directional Sun Azimuth",min:0,max:360,step:2},{type:"range",key:"exposure",label:"ACES Filmic Exposure",min:.5,max:2.5,step:.05}]},{tab:"tab-emitter",title:"Continuous Fire Plume Emitter",badge:"SOURCE",controls:[{type:"toggle",key:"emitterEnabled",label:"Enable Continuous Fuel/Fire Plume"},{type:"range",key:"emitterRate",label:"Fuel & Heat Injection Rate",min:.1,max:2.5,step:.05},{type:"range",key:"emitterRadius",label:"Nozzle / Burner Radius",min:.05,max:.25,step:.005},{type:"range",key:"emitterUpwardVelocity",label:"Jet Upward Velocity",min:.5,max:8,step:.1},{type:"range",key:"emitterSwirl",label:"Vortex Swirl Impulse",min:0,max:8,step:.1}]},{tab:"tab-emitter",title:"Detonation / Explosion Generator",badge:"BLAST",controls:[{type:"toggle",key:"shrapnelEnabled",label:"Eject 3D Ballistic Shrapnel Streamers"},{type:"range",key:"blastStrength",label:"Radial Shockwave Velocity",min:2,max:18,step:.25},{type:"range",key:"blastRadius",label:"Fireball Detonation Radius",min:.1,max:.35,step:.01},{type:"range",key:"blastTemperature",label:"Detonation Core Temperature",min:2,max:9,step:.1},{type:"range",key:"blastLobes",label:"Cauliflower Lobe Frequency",min:2,max:12,step:.5}]},{tab:"tab-emitter",title:"3D Voxelized Solid Collider",badge:"OBSTACLE",controls:[{type:"select",key:"obstacleType",label:"Collider Geometry Shape",options:[{id:0,label:"None"},{id:1,label:"Moving / Interactive Sphere"},{id:2,label:"Vertical Bridge Pier / Pillar"},{id:3,label:"Horizontal cylinder"},{id:4,label:"Deflector slab"},{id:5,label:"Tyre ring"}]},{type:"range",key:"obstacleY",label:"Collider Altitude",min:.2,max:.78,step:.01},{type:"range",key:"obstacleX",label:"Collider Horizontal Offset",min:.2,max:.8,step:.01},{type:"range",key:"obstacleZ",label:"Collider Horizontal Offset",min:.2,max:.8,step:.01},{type:"toggle",key:"colliderAutoMove",label:"Animate collider"},{type:"range",key:"colliderSpeed",label:"Moving Collider Speed",min:.1,max:3,step:.05},{type:"range",key:"obstacleRadius",label:"Collider Size / Radius",min:.08,max:.28,step:.005}]},{tab:"tab-emitter",title:"Viewport Overlays & Embers",badge:"SCENE",controls:[{type:"toggle",key:"showBoundingBox",label:"Show 3D Voxel Domain Wireframe"},{type:"toggle",key:"showVoxelGridLines",label:"Show Voxel Resolution Cell Subdivisions"},{type:"toggle",key:"showFloorGrid",label:"Show Lit Studio Floor + Volumetric Shadows"},{type:"toggle",key:"showEmbers",label:"Show GPU-Advected Fireflies / Ash Motes"},{type:"range",key:"emberCount",label:"Firefly / Ash Mote Count",min:0,max:1e3,step:10},{type:"range",key:"emberSize",label:"Firefly / Ash Mote Size",min:.35,max:2.5,step:.05},{type:"range",key:"emberIntensity",label:"Firefly Brightness / Ash Visibility",min:.1,max:3,step:.05},{type:"range",key:"emberLifetime",label:"Mote Lifetime / Drift Speed",min:.25,max:3,step:.05},{type:"range",key:"emberAshiness",label:"Ashiness",min:0,max:1,step:.01}]}],k=`#version 300 es
precision highp float;

out vec2 vUV;

void main() {
  vec2 pos = vec2(
    float((gl_VertexID & 1) << 2) - 1.0,
    float((gl_VertexID & 2) << 1) - 1.0
  );
  vUV = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`,R=`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform int uGridRes;
uniform int uTilesX;
uniform int uTilesY;
uniform vec2 uAtlasSize;

// Convert 2D atlas pixel coordinate to 3D voxel coordinate [0, uGridRes-1]^3
ivec3 fragToVoxel(ivec2 fragCoord) {
  int res = uGridRes;
  int tileX = fragCoord.x / res;
  int tileY = fragCoord.y / res;
  int vx = fragCoord.x - tileX * res;
  int vy = fragCoord.y - tileY * res;
  int vz = tileY * uTilesX + tileX;
  return ivec3(vx, vy, vz);
}

// Convert 3D voxel coordinate to 2D atlas pixel coordinate
ivec2 voxelToFrag(ivec3 v) {
  int res = uGridRes;
  ivec3 c = clamp(v, ivec3(0), ivec3(res - 1));
  int tileY = c.z / uTilesX;
  int tileX = c.z - tileY * uTilesX;
  return ivec2(tileX * res + c.x, tileY * res + c.y);
}

// Exact integer voxel fetch
vec4 fetchVoxel(sampler2D tex, ivec3 v) {
  return texelFetch(tex, voxelToFrag(v), 0);
}

// Hardware-accelerated 3D trilinear interpolation across the 2D tiled volume atlas
vec4 sampleVolumeTrilinear(sampler2D tex, vec3 uvw) {
  float res = float(uGridRes);
  vec3 c = clamp(uvw, vec3(0.0), vec3(1.0));
  vec2 xy = clamp(c.xy * res, 0.5, res - 0.5);

  float zScaled = clamp(c.z * res - 0.5, 0.0, res - 1.0001);
  int z0 = int(floor(zScaled));
  int z1 = min(z0 + 1, uGridRes - 1);
  float fz = zScaled - float(z0);

  int ty0 = z0 / uTilesX;
  int tx0 = z0 - ty0 * uTilesX;
  int ty1 = z1 / uTilesX;
  int tx1 = z1 - ty1 * uTilesX;

  vec2 uv0 = (vec2(float(tx0) * res, float(ty0) * res) + xy) / uAtlasSize;
  vec2 uv1 = (vec2(float(tx1) * res, float(ty1) * res) + xy) / uAtlasSize;

  vec4 s0 = textureLod(tex, uv0, 0.0);
  vec4 s1 = textureLod(tex, uv1, 0.0);
  return mix(s0, s1, fz);
}

// Sample with adjustable voxel quantization (0 = smooth trilinear, 1 = discrete voxel center)
vec4 sampleVolumeQuantized(sampler2D tex, vec3 uvw, float quantize) {
  if (quantize <= 0.001) {
    return sampleVolumeTrilinear(tex, uvw);
  }
  float res = float(uGridRes);
  vec3 voxelCoord = clamp(uvw, 0.0, 0.9999) * res;
  if (quantize >= 0.999) {
    return fetchVoxel(tex, ivec3(floor(voxelCoord)));
  }
  vec3 fracPart = fract(voxelCoord);
  float sharpness = mix(1.0, 14.0, quantize);
  vec3 terraced = floor(voxelCoord) + clamp((fracPart - 0.5) * sharpness + 0.5, 0.0, 1.0);
  vec3 blendedUVW = mix(uvw, terraced / res, quantize);
  return mix(
    sampleVolumeTrilinear(tex, blendedUVW),
    fetchVoxel(tex, ivec3(floor(voxelCoord))),
    quantize * quantize
  );
}

vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx) * 2.0 - 1.0;
}

float valueNoise3D(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);

  float n000 = dot(hash33(i + vec3(0,0,0)), f - vec3(0,0,0));
  float n100 = dot(hash33(i + vec3(1,0,0)), f - vec3(1,0,0));
  float n010 = dot(hash33(i + vec3(0,1,0)), f - vec3(0,1,0));
  float n110 = dot(hash33(i + vec3(1,1,0)), f - vec3(1,1,0));
  float n001 = dot(hash33(i + vec3(0,0,1)), f - vec3(0,0,1));
  float n101 = dot(hash33(i + vec3(1,0,1)), f - vec3(1,0,1));
  float n011 = dot(hash33(i + vec3(0,1,1)), f - vec3(0,1,1));
  float n111 = dot(hash33(i + vec3(1,1,1)), f - vec3(1,1,1));

  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z
  );
}

vec3 curlNoise3D(vec3 p) {
  float eps = 0.25;
  float n1 = valueNoise3D(p + vec3(0.0, eps, 0.0)) - valueNoise3D(p - vec3(0.0, eps, 0.0));
  float n2 = valueNoise3D(p + vec3(0.0, 0.0, eps)) - valueNoise3D(p - vec3(0.0, 0.0, eps));
  float n3 = valueNoise3D(p + vec3(eps, 0.0, 0.0)) - valueNoise3D(p - vec3(eps, 0.0, 0.0));
  return vec3(n1 - n2, n2 - n3, n3 - n1) / (2.0 * eps);
}
`,oe=`${R}
layout(location = 0) out vec4 outVelocity;
layout(location = 1) out vec4 outThermo;

uniform sampler2D uVelocityTex;
uniform sampler2D uThermoTex;
uniform float uDt;
uniform float uTime;
uniform vec3 uDomainScale; // Relative world bounds scale (so bigger bounds give explosions more room!)

// Continuous emitter
uniform int uEmitterEnabled;
uniform float uEmitterRate;
uniform float uEmitterRadius;
uniform float uEmitterHeight;
uniform float uEmitterUpwardVel;
uniform float uEmitterSwirl;
uniform float uEmitterTemp;
uniform float uEmitterFuel;
uniform float uEmitterSmoke;

// Instant detonation / blast wave trigger
uniform int uBlastActive;
uniform vec3 uBlastCenter;
uniform float uBlastRadius;
uniform float uBlastStrength;
uniform float uBlastTemp;
uniform float uBlastFuel;
uniform float uBlastSmoke;
uniform float uBlastLobes;
uniform float uBlastSeed;
uniform vec3 uBlastDirectionalVel;

// Interactive 3D Flamethrower / Pyro Brush
uniform int uBrushActive;
uniform vec3 uBrushPos;
uniform vec3 uBrushVel;
uniform float uBrushRadius;

// 3D Ballistic Shrapnel / Burning Debris Streamers (up to 6 flying fragments)
uniform int uProjectilesActive;
uniform vec4 uProjectiles[6];    // xyz = UVW position, w = intensity/heat (0 = inactive)
uniform vec4 uProjectileVels[6]; // xyz = velocity vector, w = radius

// Voxelized Solid Obstacle
uniform int uObstacleType;
uniform vec3 uObstaclePos;
uniform float uObstacleRadius;

float computeObstacleMask(vec3 uvw) {
  if (uObstacleType == 0) return 0.0;
  vec3 d = (uvw - uObstaclePos) * uDomainScale;
  float rad = uObstacleRadius;
  if (uObstacleType == 1) {
    return length(d) < rad ? 1.0 : 0.0;
  } else if (uObstacleType == 2) {
    return (length(d.xz) < rad * 0.75 && uvw.y < uObstaclePos.y + (rad * 1.8) / uDomainScale.y) ? 1.0 : 0.0;
  } else if (uObstacleType == 3) {
    return (length(d.yz) < rad * 0.72 && abs(d.x) < rad * 1.9) ? 1.0 : 0.0;
  } else if (uObstacleType == 4) {
    vec3 b = vec3(rad * 1.5, rad * 0.45, rad * 1.5);
    vec3 q = abs(d) - b;
    return max(max(q.x, q.y), q.z) < 0.0 ? 1.0 : 0.0;
  } else if (uObstacleType == 5) {
    return length(vec2(length(d.xy) - rad * 0.76, d.z)) < rad * 0.24 ? 1.0 : 0.0;
  }
  return 0.0;
}

void main() {
  ivec2 fc = ivec2(gl_FragCoord.xy);
  ivec3 v = fragToVoxel(fc);
  if (v.z >= uGridRes) {
    outVelocity = vec4(0.0);
    outThermo = vec4(0.0);
    return;
  }

  vec3 uvw = (vec3(v) + 0.5) / float(uGridRes);
  vec4 vel = texelFetch(uVelocityTex, fc, 0);
  vec4 thermo = texelFetch(uThermoTex, fc, 0);

  float isSolid = computeObstacleMask(uvw);
  if (isSolid > 0.5) {
    outVelocity = vec4(0.0, 0.0, 0.0, 1.0);
    outThermo = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }
  vel.a = 0.0;

  // Scale factor so larger world bounds give plumes & explosions more physical space inside [0,1]^3
  vec3 metricScale = max(vec3(0.75), pow(uDomainScale, vec3(0.55)));

  // 1. Continuous Fire/Smoke Plume Emitter at bottom center
  if (uEmitterEnabled == 1 && uEmitterRate > 0.001) {
    vec3 emitPos = vec3(0.5, uEmitterHeight / metricScale.y, 0.5);
    vec3 diff = (uvw - emitPos) * metricScale;
    float dist = length(vec3(diff.x, diff.y * 1.45, diff.z));
    if (dist < uEmitterRadius * 1.35) {
      float falloff = smoothstep(uEmitterRadius * 1.35, uEmitterRadius * 0.15, dist);
      vec3 np = uvw * uDomainScale * 8.5 + vec3(0.0, -uTime * 5.5, uTime * 1.7);
      float n = 0.55 + 0.45 * valueNoise3D(np);
      float rate = falloff * uEmitterRate * n;

      thermo.r = max(thermo.r, uEmitterSmoke * falloff * (0.6 + 0.4 * n));
      thermo.g = max(thermo.g, uEmitterTemp * rate);
      thermo.b = max(thermo.b, uEmitterFuel * rate);
      thermo.a = max(thermo.a, uEmitterFuel * rate * 0.9);

      vec3 tangent = vec3(-diff.z, 0.0, diff.x) / max(length(diff.xz), 0.02);
      vec3 turb = hash33(np) * 0.65;
      vec3 targetVel = vec3(0.0, uEmitterUpwardVel * (0.75 + 0.5 * n), 0.0)
                     + tangent * uEmitterSwirl * (dist / max(uEmitterRadius, 0.01))
                     + turb;
      vel.xyz = mix(vel.xyz, targetVel, clamp(falloff * uDt * 14.0, 0.0, 0.85));
    }
  }

  // 2. Interactive 3D Flamethrower / Pyro Brush Injection
  if (uBrushActive == 1) {
    vec3 diff = (uvw - uBrushPos) * metricScale;
    float r = length(diff);
    if (r < uBrushRadius) {
      float falloff = smoothstep(uBrushRadius, uBrushRadius * 0.15, r);
      vec3 np = uvw * uDomainScale * 10.0 + vec3(uTime * 4.0);
      float n = 0.6 + 0.4 * valueNoise3D(np);

      thermo.r = max(thermo.r, 2.2 * falloff * n);
      thermo.g = max(thermo.g, 4.8 * falloff * n);
      thermo.b = max(thermo.b, 3.8 * falloff * n);
      thermo.a = max(thermo.a, 4.2 * falloff);

      vec3 curlP = curlNoise3D(np) * 1.5;
      vel.xyz += (uBrushVel + vec3(0.0, 2.5, 0.0) + curlP) * falloff * 0.65;
    }
  }

  // 3. Instantaneous Explosion / Detonation Splat (Multi-Lobe Fireball + Shockwave)
  if (uBlastActive == 1) {
    vec3 diff = (uvw - uBlastCenter) * metricScale;
    float r = length(diff);
    vec3 dir = r > 1e-4 ? diff / r : vec3(0.0, 1.0, 0.0);

    vec3 lobeCoord = dir * uBlastLobes + vec3(uBlastSeed * 7.13, uBlastSeed * 3.71, uBlastSeed * 5.39);
    float lobeNoise = valueNoise3D(lobeCoord) * 0.35 + valueNoise3D(lobeCoord * 2.1) * 0.18;
    float effectiveRadius = uBlastRadius * (1.0 + lobeNoise);

    if (r < effectiveRadius * 1.25) {
      float coreMask = smoothstep(effectiveRadius, effectiveRadius * 0.1, r);
      float shellMask = smoothstep(effectiveRadius * 1.2, effectiveRadius * 0.45, r) *
                        smoothstep(0.0, effectiveRadius * 0.5, r);

      thermo.r += uBlastSmoke * (shellMask * 0.9 + coreMask * 0.45);
      thermo.g = max(thermo.g, uBlastTemp * coreMask * (1.0 + 0.3 * lobeNoise));
      thermo.b = max(thermo.b, uBlastFuel * coreMask);
      thermo.a = max(thermo.a, uBlastTemp * coreMask);

      vec3 curlPerturb = curlNoise3D(uvw * uDomainScale * 7.0 + uBlastSeed * 11.0) * 0.45;
      vec3 blastVel = (dir + vec3(0.0, 0.38, 0.0) + curlPerturb) * uBlastStrength *
                      smoothstep(effectiveRadius * 1.25, effectiveRadius * 0.12, r)
                    + uBlastDirectionalVel * coreMask;
      vel.xyz += blastVel;
    }

    // Ground dust / shockwave ring when detonation is near the floor
    float ringDistXZ = length(diff.xz);
    float ringHeight = abs(uvw.y - max(0.04, uBlastCenter.y * 0.45)) * metricScale.y;
    if (ringDistXZ < effectiveRadius * 1.85 && ringHeight < 0.075) {
      float ringFalloff = smoothstep(effectiveRadius * 1.85, effectiveRadius * 0.4, ringDistXZ)
                        * smoothstep(0.075, 0.01, ringHeight);
      vec2 outXZ = ringDistXZ > 1e-4 ? diff.xz / ringDistXZ : vec2(1.0, 0.0);
      vel.xz += outXZ * uBlastStrength * 0.95 * ringFalloff;
      thermo.r += uBlastSmoke * 0.65 * ringFalloff;
    }
  }

  // 4. Ballistic Shrapnel / Burning Debris Streamers (Arcing Smoke & Fire Fingers)
  if (uProjectilesActive == 1) {
    for (int k = 0; k < 6; k++) {
      vec4 proj = uProjectiles[k];
      if (proj.w <= 0.01) continue;
      vec3 pVel = uProjectileVels[k].xyz;
      float pRad = uProjectileVels[k].w;

      vec3 pDiff = (uvw - proj.xyz) * metricScale;
      float pr = length(pDiff);
      if (pr < pRad) {
        float pFalloff = smoothstep(pRad, pRad * 0.1, pr) * proj.w;
        thermo.r += 2.6 * pFalloff;
        thermo.g = max(thermo.g, 5.8 * pFalloff);
        thermo.b = max(thermo.b, 3.6 * pFalloff);
        thermo.a = max(thermo.a, 4.5 * pFalloff);
        vel.xyz += pVel * pFalloff * 0.55;
      }
    }
  }

  outVelocity = vel;
  outThermo = thermo;
}
`,ne=`${R}
layout(location = 0) out vec4 outVelocity;
layout(location = 1) out vec4 outThermo;

uniform sampler2D uVelocityTex;
uniform sampler2D uThermoTex;
uniform float uDt;
uniform float uTime;
uniform int uMacCormack;
uniform int uEnclosedBox;
uniform vec3 uDomainScale;

uniform float uBurnRate;
uniform float uBurnHeat;
uniform float uSootGen;
uniform float uCoolingRate;
uniform float uSmokeDissipation;
uniform float uVelocityDamping;

void main() {
  ivec2 fc = ivec2(gl_FragCoord.xy);
  ivec3 v = fragToVoxel(fc);
  if (v.z >= uGridRes) {
    outVelocity = vec4(0.0);
    outThermo = vec4(0.0);
    return;
  }

  vec4 curVel = texelFetch(uVelocityTex, fc, 0);
  if (curVel.a > 0.5) {
    outVelocity = vec4(0.0, 0.0, 0.0, 1.0);
    outThermo = vec4(0.0);
    return;
  }

  float res = float(uGridRes);
  vec3 uvw = (vec3(v) + 0.5) / res;

  // Scale advection step inversely with world domain size so larger bounds give physical travel room
  vec3 velScale = (uDt * 0.34) / max(vec3(0.75), pow(uDomainScale, vec3(0.65)));
  vec3 backUVW = uvw - curVel.xyz * velScale;

  vec4 advVel = sampleVolumeTrilinear(uVelocityTex, backUVW);
  vec4 advThermo = sampleVolumeTrilinear(uThermoTex, backUVW);

  if (uMacCormack == 1) {
    vec3 fwdUVW = backUVW + advVel.xyz * velScale;
    vec4 backFwdThermo = sampleVolumeTrilinear(uThermoTex, fwdUVW);
    vec4 curThermo = texelFetch(uThermoTex, fc, 0);
    vec4 corrThermo = advThermo + 0.45 * (curThermo - backFwdThermo);

    vec4 nL = fetchVoxel(uThermoTex, v + ivec3(-1, 0, 0));
    vec4 nR = fetchVoxel(uThermoTex, v + ivec3( 1, 0, 0));
    vec4 nD = fetchVoxel(uThermoTex, v + ivec3( 0,-1, 0));
    vec4 nU = fetchVoxel(uThermoTex, v + ivec3( 0, 1, 0));
    vec4 nB = fetchVoxel(uThermoTex, v + ivec3( 0, 0,-1));
    vec4 nF = fetchVoxel(uThermoTex, v + ivec3( 0, 0, 1));

    vec4 minVal = min(curThermo, min(min(nL, nR), min(min(nD, nU), min(nB, nF))));
    vec4 maxVal = max(curThermo, max(max(nL, nR), max(max(nD, nU), max(nB, nF))));
    advThermo = clamp(corrThermo, minVal, maxVal);
  }

  float smoke = max(0.0, advThermo.r);
  float temp  = max(0.0, advThermo.g);
  float fuel  = max(0.0, advThermo.b);

  float ignitionFactor = smoothstep(0.08, 0.65, temp + fuel * 0.5);
  float burnedFuel = min(fuel, fuel * uBurnRate * (0.65 + 0.65 * ignitionFactor) * uDt);
  fuel = max(0.0, fuel - burnedFuel);

  temp += burnedFuel * uBurnHeat;
  smoke += burnedFuel * uSootGen;

  float radiativeCool = uCoolingRate * (0.55 * temp + 0.14 * temp * temp) * uDt;
  temp = max(0.0, temp - radiativeCool);

  smoke = max(0.0, smoke * exp(-uSmokeDissipation * uDt));
  fuel  = max(0.0, fuel  * exp(-0.15 * uDt));

  float reaction = burnedFuel / max(uDt, 1e-4);

  if (uEnclosedBox == 0) {
    float edgeDistX = min(uvw.x, 1.0 - uvw.x);
    float edgeDistZ = min(uvw.z, 1.0 - uvw.z);
    float topDist = 1.0 - uvw.y;
    float sponge = smoothstep(0.0, 0.045, min(edgeDistX, edgeDistZ)) * smoothstep(0.0, 0.04, topDist);
    smoke *= sponge;
    temp  *= sponge;
    fuel  *= sponge;
  }

  vec3 nextVel = advVel.xyz * exp(-uVelocityDamping * uDt);

  if (v.y <= 1 && nextVel.y < 0.0) {
    nextVel.y = 0.0;
  }
  if (uEnclosedBox == 1) {
    if ((v.x <= 1 && nextVel.x < 0.0) || (v.x >= uGridRes - 2 && nextVel.x > 0.0)) nextVel.x = 0.0;
    if ((v.y >= uGridRes - 2 && nextVel.y > 0.0)) nextVel.y = 0.0;
    if ((v.z <= 1 && nextVel.z < 0.0) || (v.z >= uGridRes - 2 && nextVel.z > 0.0)) nextVel.z = 0.0;
  }

  outVelocity = vec4(nextVel, 0.0);
  outThermo = vec4(smoke, temp, fuel, reaction);
}
`,le=`${R}
layout(location = 0) out vec4 outCurl;

uniform sampler2D uVelocityTex;

void main() {
  ivec2 fc = ivec2(gl_FragCoord.xy);
  ivec3 v = fragToVoxel(fc);
  if (v.z >= uGridRes) {
    outCurl = vec4(0.0);
    return;
  }

  vec3 vL = fetchVoxel(uVelocityTex, v + ivec3(-1, 0, 0)).xyz;
  vec3 vR = fetchVoxel(uVelocityTex, v + ivec3( 1, 0, 0)).xyz;
  vec3 vD = fetchVoxel(uVelocityTex, v + ivec3( 0,-1, 0)).xyz;
  vec3 vU = fetchVoxel(uVelocityTex, v + ivec3( 0, 1, 0)).xyz;
  vec3 vB = fetchVoxel(uVelocityTex, v + ivec3( 0, 0,-1)).xyz;
  vec3 vF = fetchVoxel(uVelocityTex, v + ivec3( 0, 0, 1)).xyz;

  float dw_dy = 0.5 * (vU.z - vD.z);
  float dv_dz = 0.5 * (vF.y - vB.y);
  float du_dz = 0.5 * (vF.x - vB.x);
  float dw_dx = 0.5 * (vR.z - vL.z);
  float dv_dx = 0.5 * (vR.y - vL.y);
  float du_dy = 0.5 * (vU.x - vD.x);

  vec3 curl = vec3(dw_dy - dv_dz, du_dz - dw_dx, dv_dx - du_dy);
  outCurl = vec4(curl, length(curl));
}
`,ce=`${R}
layout(location = 0) out vec4 outVelocity;

uniform sampler2D uVelocityTex;
uniform sampler2D uThermoTex;
uniform sampler2D uCurlTex;
uniform float uDt;
uniform float uTime;
uniform float uVorticityConfinement;
uniform float uBuoyancy;
uniform float uSmokeWeight;
uniform float uTurbulenceStrength;
uniform float uTurbulenceScale;
uniform vec2 uWindXZ;

void main() {
  ivec2 fc = ivec2(gl_FragCoord.xy);
  ivec3 v = fragToVoxel(fc);
  if (v.z >= uGridRes) {
    outVelocity = vec4(0.0);
    return;
  }

  vec4 vel = texelFetch(uVelocityTex, fc, 0);
  if (vel.a > 0.5) {
    outVelocity = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec4 thermo = texelFetch(uThermoTex, fc, 0);
  float smoke = thermo.r;
  float temp  = thermo.g;
  float fuel  = thermo.b;

  float cL = fetchVoxel(uCurlTex, v + ivec3(-1, 0, 0)).a;
  float cR = fetchVoxel(uCurlTex, v + ivec3( 1, 0, 0)).a;
  float cD = fetchVoxel(uCurlTex, v + ivec3( 0,-1, 0)).a;
  float cU = fetchVoxel(uCurlTex, v + ivec3( 0, 1, 0)).a;
  float cB = fetchVoxel(uCurlTex, v + ivec3( 0, 0,-1)).a;
  float cF = fetchVoxel(uCurlTex, v + ivec3( 0, 0, 1)).a;

  vec3 gradMag = 0.5 * vec3(cR - cL, cU - cD, cF - cB);
  float gradLen = length(gradMag);
  vec3 N = gradLen > 1e-5 ? gradMag / gradLen : vec3(0.0);
  vec3 omega = texelFetch(uCurlTex, fc, 0).xyz;
  vec3 vortForce = uVorticityConfinement * cross(N, omega);

  float buoyForceY = uBuoyancy * temp - uSmokeWeight * smoke * 0.45;

  float tL = fetchVoxel(uThermoTex, v + ivec3(-1, 0, 0)).g;
  float tR = fetchVoxel(uThermoTex, v + ivec3( 1, 0, 0)).g;
  float tB = fetchVoxel(uThermoTex, v + ivec3( 0, 0,-1)).g;
  float tF = fetchVoxel(uThermoTex, v + ivec3( 0, 0, 1)).g;
  vec3 baroclinic = vec3(tR - tL, 0.0, tF - tB) * (0.35 * uBuoyancy);

  vec3 uvw = (vec3(v) + 0.5) / float(uGridRes);
  float activity = clamp(smoke * 0.6 + temp * 0.8 + fuel * 0.5, 0.0, 1.5);
  vec3 noiseCoord = uvw * uTurbulenceScale + vec3(uTime * 0.65, -uTime * 1.35, uTime * 0.45);
  vec3 subGridTurb = curlNoise3D(noiseCoord) * uTurbulenceStrength * activity;

  vec3 windForce = vec3(uWindXZ.x, 0.0, uWindXZ.y) * activity * smoothstep(0.05, 0.65, uvw.y);

  vec3 totalForce = vortForce + vec3(0.0, buoyForceY, 0.0) + baroclinic + subGridTurb + windForce;
  vel.xyz += totalForce * uDt;

  float speed = length(vel.xyz);
  if (speed > 20.0) {
    vel.xyz = (vel.xyz / speed) * 20.0;
  }

  outVelocity = vel;
}
`,ue=`${R}
layout(location = 0) out vec4 outDiv;

uniform sampler2D uVelocityTex;
uniform sampler2D uThermoTex;
uniform float uCombustionExpansion;

void main() {
  ivec2 fc = ivec2(gl_FragCoord.xy);
  ivec3 v = fragToVoxel(fc);
  if (v.z >= uGridRes) {
    outDiv = vec4(0.0);
    return;
  }

  vec4 vL = fetchVoxel(uVelocityTex, v + ivec3(-1, 0, 0));
  vec4 vR = fetchVoxel(uVelocityTex, v + ivec3( 1, 0, 0));
  vec4 vD = fetchVoxel(uVelocityTex, v + ivec3( 0,-1, 0));
  vec4 vU = fetchVoxel(uVelocityTex, v + ivec3( 0, 1, 0));
  vec4 vB = fetchVoxel(uVelocityTex, v + ivec3( 0, 0,-1));
  vec4 vF = fetchVoxel(uVelocityTex, v + ivec3( 0, 0, 1));

  vec3 uL = vL.a > 0.5 ? vec3(0.0) : vL.xyz;
  vec3 uR = vR.a > 0.5 ? vec3(0.0) : vR.xyz;
  vec3 uD = (vD.a > 0.5 || v.y == 0) ? vec3(0.0) : vD.xyz;
  vec3 uU = vU.a > 0.5 ? vec3(0.0) : vU.xyz;
  vec3 uB = vB.a > 0.5 ? vec3(0.0) : vB.xyz;
  vec3 uF = vF.a > 0.5 ? vec3(0.0) : vF.xyz;

  float div = 0.5 * ((uR.x - uL.x) + (uU.y - uD.y) + (uF.z - uB.z));

  vec4 thermo = texelFetch(uThermoTex, fc, 0);
  float reaction = thermo.a;
  float expansion = reaction * uCombustionExpansion * 0.08;

  float fireEmissionSource = clamp(thermo.g * 0.45 + thermo.b * 0.35, 0.0, 6.0);
  outDiv = vec4(div - expansion, fireEmissionSource, 0.0, 0.0);
}
`,me=`${R}
layout(location = 0) out vec4 outPressure;

uniform sampler2D uPressureTex;
uniform sampler2D uDivergenceTex;
uniform sampler2D uVelocityTex;

void main() {
  ivec2 fc = ivec2(gl_FragCoord.xy);
  ivec3 v = fragToVoxel(fc);
  if (v.z >= uGridRes) {
    outPressure = vec4(0.0);
    return;
  }

  vec4 centerP = texelFetch(uPressureTex, fc, 0);
  vec4 divSample = texelFetch(uDivergenceTex, fc, 0);
  float div = divSample.r;
  float fireSource = divSample.g;

  ivec3 iL = v + ivec3(-1, 0, 0);
  ivec3 iR = v + ivec3( 1, 0, 0);
  ivec3 iD = v + ivec3( 0,-1, 0);
  ivec3 iU = v + ivec3( 0, 1, 0);
  ivec3 iB = v + ivec3( 0, 0,-1);
  ivec3 iF = v + ivec3( 0, 0, 1);

  float sL = fetchVoxel(uVelocityTex, iL).a;
  float sR = fetchVoxel(uVelocityTex, iR).a;
  float sD = fetchVoxel(uVelocityTex, iD).a;
  float sU = fetchVoxel(uVelocityTex, iU).a;
  float sB = fetchVoxel(uVelocityTex, iB).a;
  float sF = fetchVoxel(uVelocityTex, iF).a;

  vec2 pL = sL > 0.5 ? centerP.rg : fetchVoxel(uPressureTex, iL).rg;
  vec2 pR = sR > 0.5 ? centerP.rg : fetchVoxel(uPressureTex, iR).rg;
  vec2 pD = (sD > 0.5 || v.y == 0) ? centerP.rg : fetchVoxel(uPressureTex, iD).rg;
  vec2 pU = sU > 0.5 ? centerP.rg : fetchVoxel(uPressureTex, iU).rg;
  vec2 pB = sB > 0.5 ? centerP.rg : fetchVoxel(uPressureTex, iB).rg;
  vec2 pF = sF > 0.5 ? centerP.rg : fetchVoxel(uPressureTex, iF).rg;

  float pNew = (pL.r + pR.r + pD.r + pU.r + pB.r + pF.r - div) / 6.0;
  float irrNew = (pL.g + pR.g + pD.g + pU.g + pB.g + pF.g + fireSource * 0.55) / 6.28;

  outPressure = vec4(pNew, irrNew, 0.0, 1.0);
}
`,de=`${R}
layout(location = 0) out vec4 outVelocity;

uniform sampler2D uVelocityTex;
uniform sampler2D uPressureTex;

void main() {
  ivec2 fc = ivec2(gl_FragCoord.xy);
  ivec3 v = fragToVoxel(fc);
  if (v.z >= uGridRes) {
    outVelocity = vec4(0.0);
    return;
  }

  vec4 vel = texelFetch(uVelocityTex, fc, 0);
  if (vel.a > 0.5) {
    outVelocity = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  float pC = texelFetch(uPressureTex, fc, 0).r;

  ivec3 iL = v + ivec3(-1, 0, 0);
  ivec3 iR = v + ivec3( 1, 0, 0);
  ivec3 iD = v + ivec3( 0,-1, 0);
  ivec3 iU = v + ivec3( 0, 1, 0);
  ivec3 iB = v + ivec3( 0, 0,-1);
  ivec3 iF = v + ivec3( 0, 0, 1);

  float sL = fetchVoxel(uVelocityTex, iL).a;
  float sR = fetchVoxel(uVelocityTex, iR).a;
  float sD = fetchVoxel(uVelocityTex, iD).a;
  float sU = fetchVoxel(uVelocityTex, iU).a;
  float sB = fetchVoxel(uVelocityTex, iB).a;
  float sF = fetchVoxel(uVelocityTex, iF).a;

  float pL = sL > 0.5 ? pC : fetchVoxel(uPressureTex, iL).r;
  float pR = sR > 0.5 ? pC : fetchVoxel(uPressureTex, iR).r;
  float pD = (sD > 0.5 || v.y == 0) ? pC : fetchVoxel(uPressureTex, iD).r;
  float pU = sU > 0.5 ? pC : fetchVoxel(uPressureTex, iU).r;
  float pB = sB > 0.5 ? pC : fetchVoxel(uPressureTex, iB).r;
  float pF = sF > 0.5 ? pC : fetchVoxel(uPressureTex, iF).r;

  vec3 gradP = 0.5 * vec3(pR - pL, pU - pD, pF - pB);
  vel.xyz -= gradP;

  if ((sL > 0.5 && vel.x < 0.0) || (sR > 0.5 && vel.x > 0.0)) vel.x = 0.0;
  if ((sD > 0.5 && vel.y < 0.0) || (sU > 0.5 && vel.y > 0.0)) vel.y = 0.0;
  if ((sB > 0.5 && vel.z < 0.0) || (sF > 0.5 && vel.z > 0.0)) vel.z = 0.0;

  outVelocity = vel;
}
`,he=`${R}
in vec2 vUV;
layout(location = 0) out vec4 outColor;

uniform sampler2D uThermoTex;
uniform sampler2D uVelocityTex;
uniform sampler2D uCurlTex;
uniform sampler2D uPressureTex;

// Dynamic World-Space Bounding Box
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform vec3 uDomainScale;

// Camera & Viewport
uniform vec3 uCamPos;
uniform vec3 uCamForward;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform float uTanHalfFov;
uniform float uAspect;
uniform vec2 uResolution;
uniform float uTime;

// Raymarching & Shading
uniform int uRenderChannel;
uniform int uColorPalette;
uniform int uRaymarchSteps;
uniform int uShadowSteps;
uniform float uVoxelQuantization;
uniform float uDensityExtinction;
uniform float uSmokeAlbedo;
uniform float uShadowDensity;
uniform float uFireIntensity;
uniform float uTemperatureScale;
uniform float uInternalScattering;
uniform float uPhaseAnisotropy;
uniform float uAmbientIntensity;
uniform float uSunIntensity;
uniform vec3 uSunDir;
uniform float uExposure;
uniform float uBloomIntensity;
uniform float uGodRaysIntensity;

// Supersonic Shockwave Shell
uniform float uShockwaveAge;
uniform vec3 uShockwaveCenter;
uniform float uShockwaveStrength;

// Slice Inspector
uniform int uSliceAxis;
uniform float uSlicePos;

// Obstacle & Overlays
uniform int uObstacleType;
uniform vec3 uObstaclePos;
uniform float uObstacleRadius;
uniform int uTransparentExport;
uniform int uShowVoxelGridLines;
uniform int uShowActiveVoxelCells;
uniform int uShowFloorGrid;

vec3 worldToUVW(vec3 p) {
  return (p - uBoxMin) / (uBoxMax - uBoxMin);
}

vec2 intersectBox(vec3 ro, vec3 rd, vec3 bMin, vec3 bMax) {
  vec3 safeDirection = mix(vec3(-1.0), vec3(1.0), greaterThanEqual(rd, vec3(0.0))) * max(abs(rd), vec3(1e-7));
  vec3 invRd = 1.0 / safeDirection;
  vec3 t0 = (bMin - ro) * invRd;
  vec3 t1 = (bMax - ro) * invRd;
  vec3 tSmaller = min(t0, t1);
  vec3 tBigger  = max(t0, t1);
  float tNear = max(max(tSmaller.x, tSmaller.y), tSmaller.z);
  float tFar  = min(min(tBigger.x, tBigger.y), tBigger.z);
  return vec2(tNear, tFar);
}

float interleavedGradientNoise(vec2 pixel) {
  return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
}

float hgPhase(float cosTheta, float g) {
  float g2 = g * g;
  float denom = max(1e-4, pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
  return (1.0 - g2) / (4.0 * 3.14159265 * denom);
}

float dualHenyeyGreenstein(float cosTheta, float g) {
  return mix(hgPhase(cosTheta, -0.25), hgPhase(cosTheta, g), 0.72);
}

vec3 evaluateBlackbodyPalette(float tempRaw, int palette) {
  float t = clamp(tempRaw * uTemperatureScale * 0.28, 0.0, 1.6);
  if (t <= 0.01) return vec3(0.0);

  if (palette == 0) {
    vec3 c0 = vec3(0.0);
    vec3 c1 = vec3(0.55, 0.03, 0.005);
    vec3 c2 = vec3(1.00, 0.24, 0.01);
    vec3 c3 = vec3(1.00, 0.68, 0.10);
    vec3 c4 = vec3(1.00, 0.96, 0.78);
    vec3 col = mix(c0, c1, smoothstep(0.0, 0.22, t));
    col = mix(col, c2, smoothstep(0.18, 0.52, t));
    col = mix(col, c3, smoothstep(0.48, 0.88, t));
    col = mix(col, c4, smoothstep(0.82, 1.35, t));
    return col * (t * t * 1.65);
  } else if (palette == 1) {
    vec3 col = vec3(
      smoothstep(0.02, 0.32, t),
      pow(clamp((t - 0.18) / 0.85, 0.0, 1.2), 1.75),
      pow(clamp((t - 0.58) / 0.75, 0.0, 1.2), 2.4)
    );
    return col * (t * t * 1.8);
  } else if (palette == 2) {
    vec3 col = vec3(
      smoothstep(0.01, 0.22, t),
      smoothstep(0.10, 0.55, t),
      smoothstep(0.28, 0.95, t) * 1.15
    );
    return col * (t * t * 2.1);
  } else if (palette == 3) {
    vec3 c1 = vec3(0.02, 0.38, 0.08);
    vec3 c2 = vec3(0.14, 0.95, 0.28);
    vec3 c3 = vec3(0.72, 1.00, 0.45);
    vec3 c4 = vec3(0.92, 1.00, 0.90);
    vec3 col = mix(vec3(0.0), c1, smoothstep(0.0, 0.25, t));
    col = mix(col, c2, smoothstep(0.22, 0.58, t));
    col = mix(col, c3, smoothstep(0.55, 0.92, t));
    col = mix(col, c4, smoothstep(0.88, 1.35, t));
    return col * (t * t * 1.7);
  } else if (palette == 4) {
    vec3 c1 = vec3(0.04, 0.12, 0.65);
    vec3 c2 = vec3(0.08, 0.58, 1.00);
    vec3 c3 = vec3(0.45, 0.92, 1.00);
    vec3 c4 = vec3(0.95, 0.99, 1.00);
    vec3 col = mix(vec3(0.0), c1, smoothstep(0.0, 0.25, t));
    col = mix(col, c2, smoothstep(0.22, 0.58, t));
    col = mix(col, c3, smoothstep(0.55, 0.92, t));
    col = mix(col, c4, smoothstep(0.88, 1.35, t));
    return col * (t * t * 1.85);
  } else {
    vec3 c1 = vec3(0.32, 0.02, 0.48);
    vec3 c2 = vec3(0.88, 0.08, 0.65);
    vec3 c3 = vec3(1.00, 0.48, 0.88);
    vec3 c4 = vec3(1.00, 0.92, 1.00);
    vec3 col = mix(vec3(0.0), c1, smoothstep(0.0, 0.25, t));
    col = mix(col, c2, smoothstep(0.22, 0.58, t));
    col = mix(col, c3, smoothstep(0.55, 0.92, t));
    col = mix(col, c4, smoothstep(0.88, 1.35, t));
    return col * (t * t * 1.75);
  }
}

float sdObstacle(vec3 uvw) {
  if (uObstacleType == 0) return 1e5;
  vec3 d = (uvw - uObstaclePos) * uDomainScale;
  float rad = uObstacleRadius;
  if (uObstacleType == 1) {
    return length(d) - rad;
  } else if (uObstacleType == 2) {
    vec2 w = vec2(length(d.xz) - rad * 0.75, abs(uvw.y - (uObstaclePos.y * 0.5)) * uDomainScale.y - rad * 1.4);
    return min(max(w.x, w.y), 0.0) + length(max(w, 0.0));
  } else if (uObstacleType == 3) {
    vec2 w = vec2(length(d.yz) - rad * 0.72, abs(d.x) - rad * 1.9);
    return min(max(w.x, w.y), 0.0) + length(max(w, 0.0));
  } else if (uObstacleType == 4) {
    vec3 b = vec3(rad * 1.5, rad * 0.45, rad * 1.5);
    vec3 q = abs(d) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
  } else if (uObstacleType == 5) {
    // Rounded treaded tyre: ring in the X/Y plane, axle along Z.
    return length(vec2(length(d.xy) - rad * 0.76, d.z)) - rad * 0.24;
  }
  return 1e5;
}

float marchSunTransmittance(vec3 startUVW, float quantize) {
  int steps = uShadowSteps;
  float stepLen = 0.065;
  float opticalDepth = 0.0;
  vec3 pos = startUVW;

  for (int i = 0; i < 12; i++) {
    if (i >= steps) break;
    pos += uSunDir * stepLen;
    if (any(lessThan(pos, vec3(0.0))) || any(greaterThan(pos, vec3(1.0)))) break;
    float d = sampleVolumeQuantized(uThermoTex, pos, quantize).r;
    opticalDepth += max(0.0, d) * stepLen * uShadowDensity;
    stepLen *= 1.25;
  }

  float primary = exp(-opticalDepth);
  float secondary = exp(-opticalDepth * 0.28) * 0.65;
  return mix(primary, max(primary, secondary), 0.48);
}

vec3 acesToneMap(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec4 encodeFlipbookPixel(vec3 radiance, float transmittance) {
  vec3 colour = pow(acesToneMap(max(radiance, vec3(0.0)) * uExposure), vec3(1.0 / 2.2));
  float alpha = clamp(max(1.0 - transmittance, max(colour.r, max(colour.g, colour.b))), 0.0, 1.0);
  return vec4(colour, alpha);
}

vec3 evaluateSparseVoxelOverlay(vec3 uvw, float smoke, float temp) {
  if (uShowActiveVoxelCells == 0) return vec3(0.0);
  if (smoke < 0.04 && temp < 0.08) return vec3(0.0);

  float res = float(uGridRes);
  vec3 vf = abs(fract(uvw * res) - 0.5);
  float vMax = max(vf.x, max(vf.y, vf.z));
  float vMid = vf.x + vf.y + vf.z - min(vf.x, min(vf.y, vf.z)) - vMax;
  float fineWire = smoothstep(0.45, 0.49, min(vMax, vMid));

  vec3 mf = abs(fract(uvw * max(4.0, res * 0.25)) - 0.5);
  float mMax = max(mf.x, max(mf.y, mf.z));
  float mMid = mf.x + mf.y + mf.z - min(mf.x, min(mf.y, mf.z)) - mMax;
  float macroWire = smoothstep(0.465, 0.495, min(mMax, mMid));

  vec3 wireCol = mix(vec3(0.15, 0.78, 1.0), vec3(1.0, 0.65, 0.15), clamp(temp * 0.6, 0.0, 1.0));
  return wireCol * (fineWire * 0.35 + macroWire * 0.85);
}

void main() {
  vec2 ndc = vUV * 2.0 - 1.0;
  vec3 rayOrigin = uCamPos;
  vec3 rayDir = normalize(
    uCamForward +
    ndc.x * uAspect * uTanHalfFov * uCamRight +
    ndc.y * uTanHalfFov * uCamUp
  );

  // Supersonic Shockwave Ray Refraction when an explosion just detonated
  float shockGlow = 0.0;
  if (uShockwaveAge > 0.0 && uShockwaveAge < 1.0 && uShockwaveStrength > 0.01) {
    vec3 shockWorld = uBoxMin + uShockwaveCenter * (uBoxMax - uBoxMin);
    float shockRad = uShockwaveAge * length(uBoxMax - uBoxMin) * 0.55;
    vec3 oc = rayOrigin - shockWorld;
    float b = dot(oc, rayDir);
    float c = dot(oc, oc) - shockRad * shockRad;
    float h = b * b - c;
    if (h > 0.0) {
      float edgeRing = exp(-h * 18.0 / max(shockRad * shockRad, 0.02));
      float fade = (1.0 - uShockwaveAge) * (1.0 - uShockwaveAge) * uShockwaveStrength;
      vec3 perp = normalize(oc - b * rayDir);
      rayDir = normalize(rayDir + perp * edgeRing * fade * 0.032);
      shockGlow = edgeRing * fade * 0.38;
    }
  }

  float skyGrad = clamp(rayDir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 bgSky = mix(vec3(0.035, 0.04, 0.052), vec3(0.012, 0.015, 0.022), pow(skyGrad, 0.7));
  float sunHalo = pow(max(0.0, dot(rayDir, uSunDir)), 24.0) * 0.09;
  bgSky += vec3(1.0, 0.78, 0.55) * sunHalo;

  // Studio Ground Plane at y = uBoxMin.y (-0.6)
  float tGround = 1e9;
  bool hitGround = false;
  if (uShowFloorGrid == 1 && rayDir.y < -1e-4) {
    float tg = (uBoxMin.y - rayOrigin.y) / rayDir.y;
    if (tg > 0.0 && tg < 28.0) {
      vec3 gp = rayOrigin + rayDir * tg;
      if (max(abs(gp.x), abs(gp.z)) < 7.5) {
        tGround = tg;
        hitGround = true;
      }
    }
  }

  if (hitGround) {
    vec3 gp = rayOrigin + rayDir * tGround;
    float radialFade = 1.0 - smoothstep(2.2, 7.2, length(gp.xz));

    vec2 gridMajor = abs(fract(gp.xz * 2.0 + 0.5) - 0.5) / max(fwidth(gp.xz * 2.0), vec2(1e-6));
    vec2 gridVoxel = abs(fract(gp.xz * float(uGridRes) * 0.15) - 0.5) / max(fwidth(gp.xz * float(uGridRes) * 0.15), vec2(1e-6));
    float majorLine = 1.0 - min(min(gridMajor.x, gridMajor.y), 1.0);
    float minorLine = (1.0 - min(min(gridVoxel.x, gridVoxel.y), 1.0)) * float(uShowVoxelGridLines);

    // Highlight live dynamic simulation footprint [uBoxMin.xz, uBoxMax.xz] on the studio floor!
    float inDomainFootprint = step(abs(gp.x), uBoxMax.x) * step(abs(gp.z), uBoxMax.z);
    vec3 floorBase = mix(vec3(0.026, 0.030, 0.038), vec3(0.044, 0.050, 0.064), inDomainFootprint);
    floorBase = mix(floorBase, vec3(0.09, 0.105, 0.13), majorLine * 0.55);
    floorBase = mix(floorBase, vec3(0.18, 0.42, 0.65) * 0.35, minorLine * inDomainFootprint * 0.45);

    float axisX = 1.0 - smoothstep(0.0, 0.01, abs(gp.z));
    float axisZ = 1.0 - smoothstep(0.0, 0.01, abs(gp.x));
    floorBase = mix(floorBase, vec3(0.65, 0.16, 0.16), axisX * 0.5);
    floorBase = mix(floorBase, vec3(0.16, 0.32, 0.72), axisZ * 0.5);

    if (uShockwaveAge > 0.0 && uShockwaveAge < 1.0 && uShockwaveStrength > 0.01) {
      vec2 shockXZ = uBoxMin.xz + uShockwaveCenter.xz * (uBoxMax.xz - uBoxMin.xz);
      float dGround = length(gp.xz - shockXZ);
      float waveR = uShockwaveAge * (uBoxMax.x - uBoxMin.x) * 0.85;
      float groundRing = exp(-pow((dGround - waveR) * 12.0, 2.0)) * (1.0 - uShockwaveAge) * uShockwaveStrength;
      floorBase += vec3(1.0, 0.72, 0.38) * groundRing * 0.55;
    }

    float floorShadow = 1.0;
    vec2 shadowBoxHit = intersectBox(gp + uSunDir * 0.005, uSunDir, uBoxMin, uBoxMax);
    if (shadowBoxHit.y > max(shadowBoxHit.x, 0.0)) {
      float tS = max(shadowBoxHit.x, 0.02);
      float dtS = (shadowBoxHit.y - tS) / 6.0;
      float tau = 0.0;
      for (int s = 0; s < 6; s++) {
        vec3 sp = worldToUVW(gp + uSunDir * (tS + (float(s) + 0.5) * dtS));
        tau += sampleVolumeTrilinear(uThermoTex, sp).r * dtS * uShadowDensity * 0.85;
      }
      floorShadow = exp(-tau);
    }

    vec3 sampleAboveUVW = clamp(worldToUVW(vec3(gp.x, uBoxMin.y + 0.18, gp.z)), 0.0, 1.0);
    float distFromDomain = length(max(abs(gp.xz) - uBoxMax.xz, 0.0));
    float bounceIrr = sampleVolumeTrilinear(uPressureTex, sampleAboveUVW).g * exp(-distFromDomain * 2.5);
    vec3 bounceColor = evaluateBlackbodyPalette(max(0.85, bounceIrr * 1.4), uColorPalette) * bounceIrr * 0.55;
    vec3 floorLit = floorBase * (0.35 + 0.65 * floorShadow * uSunIntensity * 0.5) + bounceColor;
    bgSky = mix(bgSky, floorLit, radialFade);
  }

  vec2 boxHit = intersectBox(rayOrigin, rayDir, uBoxMin, uBoxMax);
  float tEnter = max(boxHit.x, 0.0);
  float tExit  = min(boxHit.y, tGround);

  if (tExit <= tEnter) {
    if (uTransparentExport == 1) { outColor = encodeFlipbookPixel(vec3(1.0, 0.85, 0.65) * shockGlow, 1.0); return; }
    vec3 finalBg = acesToneMap((bgSky + vec3(1.0, 0.85, 0.65) * shockGlow) * uExposure);
    outColor = vec4(pow(finalBg, vec3(1.0 / 2.2)), 1.0);
    return;
  }

  // --- MODE 8: 2D Axis Cross-Section Slice Inspector ---
  if (uRenderChannel == 8) {
    vec3 accum = bgSky;
    vec3 sliceWorld = mix(uBoxMin, uBoxMax, vec3(uSlicePos));
    float tSlice = -1.0;
    if (uSliceAxis == 0 && abs(rayDir.x) > 1e-5) tSlice = (sliceWorld.x - rayOrigin.x) / rayDir.x;
    if (uSliceAxis == 1 && abs(rayDir.y) > 1e-5) tSlice = (sliceWorld.y - rayOrigin.y) / rayDir.y;
    if (uSliceAxis == 2 && abs(rayDir.z) > 1e-5) tSlice = (sliceWorld.z - rayOrigin.z) / rayDir.z;

    if (tSlice >= tEnter && tSlice <= tExit) {
      vec3 pHit = rayOrigin + rayDir * tSlice;
      vec3 uvw = worldToUVW(pHit);
      vec4 th = sampleVolumeQuantized(uThermoTex, uvw, uVoxelQuantization);
      vec3 vel = sampleVolumeQuantized(uVelocityTex, uvw, uVoxelQuantization).xyz;
      float res = float(uGridRes);
      vec3 cellFrac = abs(fract(uvw * res) - 0.5);
      float voxelGrid = smoothstep(0.47, 0.495, max(cellFrac.x, max(cellFrac.y, cellFrac.z)));

      vec3 fireCol = evaluateBlackbodyPalette(th.g, uColorPalette);
      vec3 smokeCol = vec3(th.r * 0.45);
      vec3 velCol = abs(vel) * 0.12;
      vec3 sliceCol = vec3(0.05, 0.06, 0.08) + smokeCol + fireCol + velCol;
      sliceCol = mix(sliceCol, vec3(0.25, 0.65, 1.0), voxelGrid * 0.45);
      accum = mix(bgSky, sliceCol, 0.92);
    }
    accum = acesToneMap(accum * uExposure);
    outColor = vec4(pow(accum, vec3(1.0 / 2.2)), 1.0);
    return;
  }

  // --- MODE 1: Explicit 3D Voxel DDA Raymarching (Discrete Voxel Grid Cubes) ---
  if (uRenderChannel == 1) {
    float res = float(uGridRes);
    vec3 startP = worldToUVW(rayOrigin + rayDir * (tEnter + 0.0002)) * res;
    vec3 rdGrid = normalize(rayDir / (uBoxMax - uBoxMin));

    ivec3 mapPos = clamp(ivec3(floor(startP)), ivec3(0), ivec3(uGridRes - 1));
    vec3 deltaDist = abs(vec3(1.0) / max(abs(rdGrid), vec3(1e-5)));
    ivec3 rayStep = ivec3(sign(rdGrid));
    vec3 sideDist = (sign(rdGrid) * (vec3(mapPos) - startP) + (sign(rdGrid) * 0.5) + 0.5) * deltaDist;
    bvec3 mask = bvec3(false);

    vec3 accumLight = vec3(0.0);
    float transmittance = 1.0;
    float stepWorldScale = 1.0 / res;

    int maxDDASteps = min(uGridRes * 2, 180);
    for (int i = 0; i < 180; i++) {
      if (i >= maxDDASteps) break;
      if (any(lessThan(mapPos, ivec3(0))) || any(greaterThanEqual(mapPos, ivec3(uGridRes)))) break;

      vec4 th = fetchVoxel(uThermoTex, mapPos);
      vec4 velAndSolid = fetchVoxel(uVelocityTex, mapPos);
      float irr = fetchVoxel(uPressureTex, mapPos).g;

      if (velAndSolid.a > 0.5 && uTransparentExport == 0) {
        vec3 n = vec3(mask) * (-sign(rdGrid));
        if (length(n) < 0.1) n = -rayDir;
        float diff = max(0.18, dot(n, uSunDir));
        vec3 solidCol = vec3(0.28, 0.32, 0.38) * diff + evaluateBlackbodyPalette(irr, uColorPalette) * 0.35;
        accumLight += transmittance * solidCol;
        transmittance = 0.0;
        break;
      }

      float smoke = th.r;
      float temp  = th.g;

      if (smoke > 0.015 || temp > 0.02) {
        vec3 uvwCenter = (vec3(mapPos) + 0.5) / res;
        vec3 voxelNormal = vec3(mask) * (-sign(rdGrid));
        float facetShade = 0.78 + 0.22 * max(0.0, dot(voxelNormal, uSunDir));

        float sunTrans = marchSunTransmittance(uvwCenter, 1.0);
        vec3 sunColor = vec3(1.0, 0.92, 0.80) * uSunIntensity;
        vec3 ambientColor = vec3(0.32, 0.40, 0.52) * uAmbientIntensity;

        vec3 internalGlow = evaluateBlackbodyPalette(max(0.7, irr * 1.3), uColorPalette)
                          * irr * uInternalScattering * 0.55;

        vec3 smokeScattering = uSmokeAlbedo * facetShade * (sunColor * sunTrans + ambientColor) + internalGlow;
        vec3 fireEmission = evaluateBlackbodyPalette(temp, uColorPalette) * uFireIntensity;

        float ext = max(0.02, smoke * uDensityExtinction + temp * 1.5) * stepWorldScale * 1.15;
        float stepTrans = exp(-ext);
        float weight = (1.0 - stepTrans);

        accumLight += transmittance * (smokeScattering * clamp(smoke * 2.5, 0.0, 1.0) + fireEmission * 0.32) * weight;
        transmittance *= stepTrans;

        if (transmittance < 0.01) {
          transmittance = 0.0;
          break;
        }
      }

      mask = lessThanEqual(sideDist.xyz, min(sideDist.yzx, sideDist.zxy));
      sideDist += vec3(mask) * deltaDist;
      mapPos += ivec3(vec3(mask)) * rayStep;
    }

    if (uTransparentExport == 1) { outColor = encodeFlipbookPixel(accumLight, transmittance); return; }
    vec3 finalCol = accumLight + bgSky * transmittance;
    finalCol = acesToneMap(finalCol * uExposure);
    outColor = vec4(pow(finalCol, vec3(1.0 / 2.2)), 1.0);
    return;
  }

  // --- STANDARD CONTINUOUS / QUANTIZED VOLUMETRIC RAYMARCHING ---
  int numSteps = uRaymarchSteps;
  float boxDiag = length(uBoxMax - uBoxMin);
  float baseStepSize = (boxDiag * 0.82) / float(numSteps);
  // Normalize optical density relative to box size so expanding bounds keeps physical opacity consistent
  float opticalScale = 1.75 / max(1.0, boxDiag);

  float jitter = interleavedGradientNoise(gl_FragCoord.xy);
  float t = tEnter + jitter * baseStepSize;

  vec3 accumLight = vec3(0.0);
  vec3 accumBloom = vec3(0.0);
  float transmittance = 1.0;

  float cosTheta = dot(rayDir, uSunDir);
  float phaseVal = dualHenyeyGreenstein(cosTheta, uPhaseAnisotropy);
  vec3 sunLightColor = vec3(1.0, 0.93, 0.82) * uSunIntensity;
  vec3 skyAmbientColor = vec3(0.30, 0.38, 0.52) * uAmbientIntensity;

  for (int i = 0; i < 160; i++) {
    if (i >= numSteps || t >= tExit) break;

    vec3 pWorld = rayOrigin + rayDir * t;
    vec3 uvw = worldToUVW(pWorld);

    if (uObstacleType != 0 && uTransparentExport == 0) {
      float obsDist = sdObstacle(uvw);
      if (obsDist < 0.0) {
        vec2 eps = vec2(0.008, 0.0);
        vec3 n = normalize(vec3(
          sdObstacle(uvw + eps.xyy) - sdObstacle(uvw - eps.xyy),
          sdObstacle(uvw + eps.yxy) - sdObstacle(uvw - eps.yxy),
          sdObstacle(uvw + eps.yyx) - sdObstacle(uvw - eps.yyx)
        ));
        float irr = sampleVolumeTrilinear(uPressureTex, uvw + n * 0.03).g;
        float diff = max(0.15, dot(n, uSunDir));
        float rim = pow(1.0 - max(0.0, dot(n, -rayDir)), 3.0) * 0.25;

        float res = float(uGridRes);
        vec3 vCell = abs(fract(uvw * res) - 0.5);
        float vEdge = smoothstep(0.44, 0.49, max(vCell.x, max(vCell.y, vCell.z)));

        vec3 obsCol = vec3(0.22, 0.25, 0.30) * diff
                    + vec3(0.45, 0.55, 0.70) * rim
                    + vec3(1.0, 0.52, 0.15) * vEdge * 0.35
                    + evaluateBlackbodyPalette(max(0.8, irr * 1.3), uColorPalette) * irr * 0.65;
        accumLight += transmittance * obsCol;
        transmittance = 0.0;
        break;
      }
    }

    vec4 thermo = sampleVolumeQuantized(uThermoTex, uvw, uVoxelQuantization);
    float smoke = thermo.r;
    float temp  = thermo.g;
    float fuel  = thermo.b;
    float react = thermo.a;

    if (uRenderChannel >= 2) {
      vec3 debugEmission = vec3(0.0);
      float debugDensity = 0.0;

      if (uRenderChannel == 2) {
        debugDensity = smoke * 14.0;
        float sunT = marchSunTransmittance(uvw, uVoxelQuantization);
        debugEmission = vec3(0.85, 0.88, 0.94) * (0.25 + 0.75 * sunT) * debugDensity;
      } else if (uRenderChannel == 3) {
        debugDensity = temp * 8.0;
        debugEmission = evaluateBlackbodyPalette(temp * 1.15, uColorPalette) * 4.5;
      } else if (uRenderChannel == 4) {
        debugDensity = (fuel + react * 0.5) * 9.0;
        debugEmission = mix(vec3(0.1, 0.65, 1.0), vec3(1.0, 0.85, 0.2), clamp(react * 0.4, 0.0, 1.0)) * debugDensity * 1.8;
      } else if (uRenderChannel == 5) {
        vec3 vel = sampleVolumeQuantized(uVelocityTex, uvw, uVoxelQuantization).xyz;
        float speed = length(vel);
        debugDensity = clamp(speed * 1.6, 0.0, 12.0);
        debugEmission = (abs(vel) / max(speed, 0.001)) * debugDensity * 1.6;
      } else if (uRenderChannel == 6) {
        vec4 curlS = sampleVolumeQuantized(uCurlTex, uvw, uVoxelQuantization);
        debugDensity = curlS.a * 4.5;
        debugEmission = mix(vec3(0.15, 0.3, 0.95), vec3(1.0, 0.35, 0.1), clamp(curlS.a * 0.35, 0.0, 1.0)) * debugDensity * 1.5;
      } else if (uRenderChannel == 7) {
        float pVal = sampleVolumeQuantized(uPressureTex, uvw, uVoxelQuantization).r;
        debugDensity = abs(pVal) * 22.0;
        vec3 pCol = pVal >= 0.0 ? vec3(1.0, 0.35, 0.15) : vec3(0.15, 0.55, 1.0);
        debugEmission = pCol * debugDensity * 2.2;
      }

      if (debugDensity > 0.01) {
        float stepTrans = exp(-debugDensity * baseStepSize * opticalScale);
        accumLight += transmittance * debugEmission * baseStepSize * opticalScale;
        transmittance *= stepTrans;
      }
    } else {
      if (smoke > 0.004 || temp > 0.015) {
        float effStep = baseStepSize * opticalScale;
        float extinction = max(0.001, smoke * uDensityExtinction + temp * 0.65);
        float stepTrans = exp(-extinction * effStep);

        float sunTrans = marchSunTransmittance(uvw, uVoxelQuantization);
        float powder = 1.0 - 0.45 * exp(-smoke * uDensityExtinction * 2.2);
        vec3 directSunScatter = sunLightColor * sunTrans * phaseVal * powder * 2.4;

        float heightAO = mix(0.45, 1.15, uvw.y);
        vec3 ambientScatter = skyAmbientColor * heightAO;

        float fireIrradiance = sampleVolumeTrilinear(uPressureTex, uvw).g;
        vec3 internalFireLight = evaluateBlackbodyPalette(max(0.75, fireIrradiance * 1.25), uColorPalette)
                               * fireIrradiance * uInternalScattering * (0.45 + 0.55 * exp(-smoke * 0.9));

        vec3 smokeScatteredRadiance = uSmokeAlbedo * (directSunScatter + ambientScatter) + internalFireLight;
        vec3 fireEmission = evaluateBlackbodyPalette(temp, uColorPalette) * uFireIntensity;

        vec3 sparseOverlay = evaluateSparseVoxelOverlay(uvw, smoke, temp);

        vec3 totalSource = smokeScatteredRadiance * (smoke * uDensityExtinction)
                         + fireEmission * (1.0 + react * 0.25)
                         + sparseOverlay * 8.0;
        vec3 stepIntegral = totalSource * ((1.0 - stepTrans) / extinction);

        accumLight += transmittance * stepIntegral;
        accumBloom += transmittance * internalFireLight * effStep * 0.65;
        transmittance *= stepTrans;

        if (transmittance < 0.008) {
          transmittance = 0.0;
          break;
        }
      } else if (uBloomIntensity > 0.01 || uGodRaysIntensity > 0.01) {
        float effStep = baseStepSize * opticalScale;
        float airIrr = sampleVolumeTrilinear(uPressureTex, uvw).g;
        if (airIrr > 0.02 && uBloomIntensity > 0.01) {
          vec3 haloCol = evaluateBlackbodyPalette(max(0.7, airIrr * 1.1), uColorPalette) * airIrr;
          accumBloom += transmittance * haloCol * effStep * 0.55;
        }
        // Crepuscular Volumetric God-Ray Sun Shafts & Fire Shafts through smoke gaps (every 2nd step)
        if (uGodRaysIntensity > 0.01 && (i & 1) == 0) {
          float sunShaft = marchSunTransmittance(uvw, 0.0);
          float radialMask = (1.0 - smoothstep(0.05, 0.55, length(uvw.xz - vec2(0.5)))) * (1.0 - smoothstep(0.15, 0.95, uvw.y));
          vec3 shaftLight = sunLightColor * sunShaft * (0.25 + 1.45 * phaseVal) * radialMask * 0.09;
          accumBloom += transmittance * shaftLight * effStep * 2.0 * (uGodRaysIntensity / max(uBloomIntensity, 0.25));
        }
      }
    }

    t += baseStepSize;
  }

  if (uTransparentExport == 1) { outColor = encodeFlipbookPixel(accumLight + accumBloom * uBloomIntensity + vec3(1.0, 0.85, 0.65) * shockGlow, transmittance); return; }
  vec3 finalColor = accumLight
                  + accumBloom * uBloomIntensity
                  + bgSky * transmittance
                  + vec3(1.0, 0.85, 0.65) * shockGlow;
  finalColor = acesToneMap(finalColor * uExposure);
  outColor = vec4(pow(finalColor, vec3(1.0 / 2.2)), 1.0);
}
`,fe=`${R}
layout(location = 0) in vec4 aSeed;

uniform sampler2D uVelocityTex;
uniform sampler2D uThermoTex;
uniform float uTime;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform vec3 uCamPos;
uniform vec3 uCamForward;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform float uTanHalfFov;
uniform float uAspect;
uniform float uEmberSize;
uniform float uEmberLifetime;

out float vHeat;
out float vAlpha;

void main() {
  float life = fract(aSeed.w + uTime * (0.28 + 0.22 * aSeed.x) / max(uEmberLifetime, 0.15));
  float angle = aSeed.y * 6.2831853 + uTime * 1.4;
  float rad = sqrt(aSeed.z) * 0.18;

  vec3 baseUVW = vec3(
    0.5 + cos(angle) * rad * (1.0 + life * 1.4),
    0.06 + life * 0.88,
    0.5 + sin(angle) * rad * (1.0 + life * 1.4)
  );

  vec3 flowVel = sampleVolumeTrilinear(uVelocityTex, baseUVW).xyz;
  vec4 thermo = sampleVolumeTrilinear(uThermoTex, baseUVW);

  vec3 displacedUVW = clamp(baseUVW + flowVel * (life * 0.085), 0.02, 0.98);
  vec3 worldPos = uBoxMin + displacedUVW * (uBoxMax - uBoxMin);

  vec3 toCam = worldPos - uCamPos;
  float zCam = dot(toCam, uCamForward);
  if (zCam <= 0.1) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vAlpha = 0.0;
    vHeat = 0.0;
    return;
  }

  float xCam = dot(toCam, uCamRight);
  float yCam = dot(toCam, uCamUp);

  float ndcX = xCam / (zCam * uAspect * uTanHalfFov);
  float ndcY = yCam / (zCam * uTanHalfFov);

  float localActivity = clamp(thermo.g * 0.7 + thermo.r * 0.5 + length(flowVel) * 0.15, 0.0, 1.5);
  vHeat = clamp((1.0 - life * 0.75) * (0.65 + 0.6 * aSeed.x) + thermo.g * 0.25, 0.0, 1.5);
  vAlpha = sin(life * 3.14159265) * smoothstep(0.05, 0.35, localActivity);

  gl_Position = vec4(ndcX, ndcY, 0.0, 1.0);
  gl_PointSize = clamp((4.8 + 5.8 * aSeed.x) * uEmberSize / zCam, 1.5, 14.0);
}
`,pe=`#version 300 es
precision highp float;

in float vHeat;
in float vAlpha;
uniform float uEmberIntensity;
uniform float uEmberAshiness;
layout(location = 0) out vec4 outColor;

void main() {
  if (vAlpha <= 0.01) discard;
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;

  float core = exp(-r2 * 3.2);
  vec3 hotCol = mix(vec3(1.0, 0.22, 0.02), vec3(1.0, 0.88, 0.45), clamp(vHeat, 0.0, 1.0));
  vec3 ashCol = mix(vec3(0.20, 0.22, 0.24), vec3(0.72, 0.75, 0.78), clamp(vHeat * 0.65, 0.0, 1.0));
  vec3 emberCol = mix(hotCol, ashCol, clamp(uEmberAshiness, 0.0, 1.0));
  float glow = mix(1.4, 0.65, clamp(uEmberAshiness, 0.0, 1.0)) * uEmberIntensity;
  outColor = vec4(emberCol * core * glow, core * vAlpha * 0.85);
}
`,ve=`#version 300 es
precision highp float;

in vec2 vUV;
layout(location = 0) out vec4 outColor;

uniform sampler2D uAtlasTex;
uniform int uFieldMode;
uniform int uTilesX;
uniform int uTilesY;

void main() {
  vec4 s = texture(uAtlasTex, vUV);
  vec3 col = vec3(0.03, 0.04, 0.055);

  if (uFieldMode == 0) {
    vec3 fire = vec3(1.0, 0.38, 0.05) * s.g * 0.45 + vec3(1.0, 0.88, 0.35) * s.b * 0.35;
    vec3 smoke = vec3(0.55, 0.62, 0.72) * s.r * 0.45;
    col += smoke + fire;
  } else if (uFieldMode == 1) {
    col += abs(s.xyz) * 0.28;
  } else if (uFieldMode == 2) {
    col += mix(vec3(0.05, 0.25, 0.85), vec3(1.0, 0.42, 0.08), clamp(s.a * 0.25, 0.0, 1.0)) * clamp(s.a * 0.35, 0.0, 1.2);
  } else {
    vec3 presCol = s.r >= 0.0 ? vec3(0.2, 0.7, 1.0) * s.r * 2.5 : vec3(0.9, 0.2, 0.4) * (-s.r) * 2.5;
    vec3 irrCol = vec3(1.0, 0.52, 0.12) * s.g * 0.55;
    col += presCol + irrCol;
  }

  vec2 tileCoord = vUV * vec2(float(uTilesX), float(uTilesY));
  vec2 tileFrac = abs(fract(tileCoord) - 0.5);
  float tileBorder = smoothstep(0.47, 0.495, max(tileFrac.x, tileFrac.y));
  col = mix(col, vec3(0.25, 0.34, 0.48), tileBorder * 0.65);

  vec2 outerFrac = abs(vUV - 0.5);
  float outerBorder = smoothstep(0.488, 0.498, max(outerFrac.x, outerFrac.y));
  col = mix(col, vec3(1.0, 0.45, 0.12), outerBorder);

  outColor = vec4(clamp(col, 0.0, 1.0), 0.94);
}
`;class Q{constructor(i,t,e={}){this.canvas=i,this.params=t,this.transparentExport=!!e.transparent,this.backendName="WebGL2 (GLSL 300 es)";const r=i.getContext("webgl2",{alpha:this.transparentExport,premultipliedAlpha:!0,depth:!1,stencil:!1,antialias:!1,powerPreference:"high-performance",preserveDrawingBuffer:!1});if(!r)throw new Error("WebGL2 is not supported on this browser/device.");if(this.gl=r,this.extColorBufferFloat=r.getExtension("EXT_color_buffer_float"),!this.extColorBufferFloat)throw new Error("Floating-point render targets are required for this gas solver.");this.extFloatLinear=r.getExtension("OES_texture_float_linear"),this.time=0,this.stepCount=0,this.pendingBlasts=[],this.simDurationMs=0,this.dynamicBoundsSurge=0,this.dynamicBoundsTarget=0,this.brushState={active:!1,pos:[.5,.3,.5],vel:[0,2.5,0],radius:.1},this.shockwaveAge=99,this.shockwaveCenter=[.5,.22,.5],this.projectiles=[],this.quadVAO=r.createVertexArray(),this.programs={splat:this.createProgram(k,oe),advect:this.createProgram(k,ne),curl:this.createProgram(k,le),forces:this.createProgram(k,ce),divergence:this.createProgram(k,ue),pressure:this.createProgram(k,me),gradient:this.createProgram(k,de),raymarch:this.createProgram(k,he),embers:this.createProgram(fe,pe),atlasMinimap:this.createProgram(k,ve)},this.initEmberParticles(1e3),this.initGridBuffers(t.gridResolution)}createShader(i,t){const e=this.gl,r=e.createShader(i);if(e.shaderSource(r,t),e.compileShader(r),!e.getShaderParameter(r,e.COMPILE_STATUS)){const a=e.getShaderInfoLog(r);throw e.deleteShader(r),new Error(`GLSL Compile Error:
${a}`)}return r}createProgram(i,t){const e=this.gl,r=this.createShader(e.VERTEX_SHADER,i),a=this.createShader(e.FRAGMENT_SHADER,t),l=e.createProgram();if(e.attachShader(l,r),e.attachShader(l,a),e.linkProgram(l),e.deleteShader(r),e.deleteShader(a),!e.getProgramParameter(l,e.LINK_STATUS)){const h=e.getProgramInfoLog(l);throw e.deleteProgram(l),new Error(`GLSL Link Error:
${h}`)}const n={},u=e.getProgramParameter(l,e.ACTIVE_UNIFORMS);for(let h=0;h<u;h++){const s=e.getActiveUniform(l,h).name.replace(/\[0\]$/,"");n[s]=e.getUniformLocation(l,s)}return{prog:l,uniforms:n}}initEmberParticles(i){const t=this.gl;this.maxEmbers=i;const e=new Float32Array(i*4);for(let r=0;r<i;r++)e[r*4+0]=Math.random(),e[r*4+1]=Math.random(),e[r*4+2]=Math.random(),e[r*4+3]=Math.random();this.emberVAO=t.createVertexArray(),this.emberVBO=t.createBuffer(),t.bindVertexArray(this.emberVAO),t.bindBuffer(t.ARRAY_BUFFER,this.emberVBO),t.bufferData(t.ARRAY_BUFFER,e,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,4,t.FLOAT,!1,16,0),t.bindVertexArray(null)}createVolumeTexture(i,t){const e=this.gl,r=e.createTexture();e.bindTexture(e.TEXTURE_2D,r);const a=this.extColorBufferFloat?e.RGBA16F:e.RGBA8,l=this.extColorBufferFloat?e.HALF_FLOAT:e.UNSIGNED_BYTE;return e.texImage2D(e.TEXTURE_2D,0,a,i,t,0,e.RGBA,l,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),r}createFBO(i){const t=this.gl,e=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,e);const r=[];for(let a=0;a<i.length;a++){const l=t.COLOR_ATTACHMENT0+a;t.framebufferTexture2D(t.FRAMEBUFFER,l,t.TEXTURE_2D,i[a],0),r.push(l)}if(t.drawBuffers(r),t.checkFramebufferStatus(t.FRAMEBUFFER)!==t.FRAMEBUFFER_COMPLETE)throw new Error("The GPU could not allocate the simulation grid. Try a smaller resolution.");return t.bindFramebuffer(t.FRAMEBUFFER,null),e}initGridBuffers(i){const t=this.gl,e=_.find(l=>l.value===Number(i))||_[4];if(this.gridRes=e.value,this.tilesX=e.tilesX,this.tilesY=e.tilesY,this.atlasWidth=this.gridRes*this.tilesX,this.atlasHeight=this.gridRes*this.tilesY,this.buffers){const{vel0:l,vel1:n,thermo0:u,thermo1:h,curl:m,div:s,pres0:f,pres1:v}=this.buffers;[l,n,u,h,m,s,f,v].forEach(b=>b&&t.deleteTexture(b)),Object.values(this.fbos||{}).forEach(b=>b&&t.deleteFramebuffer(b))}const r=this.atlasWidth,a=this.atlasHeight;this.buffers={vel0:this.createVolumeTexture(r,a),vel1:this.createVolumeTexture(r,a),thermo0:this.createVolumeTexture(r,a),thermo1:this.createVolumeTexture(r,a),curl:this.createVolumeTexture(r,a),div:this.createVolumeTexture(r,a),pres0:this.createVolumeTexture(r,a),pres1:this.createVolumeTexture(r,a)},this.fbos={velThermo0:this.createFBO([this.buffers.vel0,this.buffers.thermo0]),velThermo1:this.createFBO([this.buffers.vel1,this.buffers.thermo1]),vel0:this.createFBO([this.buffers.vel0]),vel1:this.createFBO([this.buffers.vel1]),curl:this.createFBO([this.buffers.curl]),div:this.createFBO([this.buffers.div]),pres0:this.createFBO([this.buffers.pres0]),pres1:this.createFBO([this.buffers.pres1])},this.clearGrid()}setGridResolution(i){Number(i)!==this.gridRes&&this.initGridBuffers(Number(i))}clearGrid(){const i=this.gl;i.clearColor(0,0,0,0),Object.values(this.fbos).forEach(t=>{i.bindFramebuffer(i.FRAMEBUFFER,t),i.clear(i.COLOR_BUFFER_BIT)}),i.bindFramebuffer(i.FRAMEBUFFER,null),this.shockwaveAge=99,this.dynamicBoundsSurge=0,this.dynamicBoundsTarget=0,this.projectiles=[]}setBrush(i,t,e=!0){this.brushState.active=e,i&&(this.brushState.pos=i),t&&(this.brushState.vel=t),e&&this.params.dynamicBounds&&(this.dynamicBoundsTarget=Math.max(this.dynamicBoundsTarget,.55))}spawnShrapnelBurst(i=[.5,.22,.5],t=6){this.projectiles=[];for(let e=0;e<Math.min(6,t);e++){const r=e/t*Math.PI*2+(Math.random()-.5)*.45,a=.55+Math.random()*.45,l=.72+Math.random()*.55;this.projectiles.push({pos:[i[0],Math.max(.08,i[1]),i[2]],vel:[Math.cos(r)*a,l,Math.sin(r)*a],age:0,maxLife:1.55+Math.random()*.65,radius:.052+Math.random()*.018})}this.dynamicBoundsTarget=Math.min(1,this.dynamicBoundsTarget+.75)}triggerExplosion(i={}){const t=this.params,e=i.center||[.5,.18,.5];this.pendingBlasts.push({center:e,radius:i.radius??t.blastRadius,strength:i.strength??t.blastStrength,temp:i.temp??t.blastTemperature,fuel:i.fuel??t.blastFuel,smoke:i.smoke??t.blastSmoke,lobes:i.lobes??t.blastLobes,directionalVel:i.directionalVel||[0,0,0],seed:Math.random()*100}),this.shockwaveCenter=[...e],this.shockwaveAge=.01,this.dynamicBoundsTarget=Math.min(1,this.dynamicBoundsTarget+.65),(i.spawnShrapnel??t.shrapnelEnabled)&&this.spawnShrapnelBurst(e,6)}getBoundsBox(){const i=this.params,t=i.dynamicBoundsMax||1.55,e=i.dynamicBounds?1+this.dynamicBoundsSurge*(t-1):1,r=(i.boundsWidth||1.85)*e,a=(i.boundsHeight||2.1)*(1+(e-1)*1.15),l=-.6,n=[-.5*r,l,-.5*r],u=[.5*r,l+a,.5*r],h=[r,a/1.2,r];return{boxMin:n,boxMax:u,domainScale:h,effWidth:r,effHeight:a,surgeMult:e}}setCommonVolumeUniforms(i){const t=this.gl;i.uGridRes!==void 0&&t.uniform1i(i.uGridRes,this.gridRes),i.uTilesX!==void 0&&t.uniform1i(i.uTilesX,this.tilesX),i.uTilesY!==void 0&&t.uniform1i(i.uTilesY,this.tilesY),i.uAtlasSize!==void 0&&t.uniform2f(i.uAtlasSize,this.atlasWidth,this.atlasHeight)}bindTex(i,t,e){const r=this.gl;r.activeTexture(r.TEXTURE0+i),r.bindTexture(r.TEXTURE_2D,t),e!=null&&r.uniform1i(e,i)}stepSimulation(i){const t=this.gl,e=this.params,r=performance.now(),a=Math.min(i,.033)*e.timeScale;if(this.time+=a,this.stepCount++,this.shockwaveAge<2&&(this.shockwaveAge+=a*1.45),e.dynamicBounds){const m=this.dynamicBoundsTarget>this.dynamicBoundsSurge?2.8:.45;this.dynamicBoundsSurge+=(this.dynamicBoundsTarget-this.dynamicBoundsSurge)*Math.min(1,a*m),this.dynamicBoundsTarget=Math.max(0,this.dynamicBoundsTarget-a*.22)}else this.dynamicBoundsSurge=0,this.dynamicBoundsTarget=0;const{domainScale:l}=this.getBoundsBox(),n=new Float32Array(24),u=new Float32Array(24);let h=0;for(let m=0;m<this.projectiles.length;m++){const s=this.projectiles[m];if(s.age+=a,!(s.age>=s.maxLife)&&(s.pos[0]+=s.vel[0]/Math.max(1,l[0]*.7)*a,s.pos[1]+=s.vel[1]/Math.max(1,l[1]*.7)*a,s.pos[2]+=s.vel[2]/Math.max(1,l[2]*.7)*a,s.vel[1]-=1.28*a,s.pos[1]<.04&&s.vel[1]<0&&(s.pos[1]=.04,s.vel[1]=-s.vel[1]*.48,s.vel[0]*=.72,s.vel[2]*=.72),s.pos[0]>.04&&s.pos[0]<.96&&s.pos[2]>.04&&s.pos[2]<.96&&s.pos[1]<.95)){const f=Math.max(0,1-s.age/s.maxLife);n[h*4+0]=s.pos[0],n[h*4+1]=s.pos[1],n[h*4+2]=s.pos[2],n[h*4+3]=f,u[h*4+0]=s.vel[0]*6.5,u[h*4+1]=s.vel[1]*6.5,u[h*4+2]=s.vel[2]*6.5,u[h*4+3]=s.radius*(.65+.35*f),h++}}t.bindVertexArray(this.quadVAO),t.viewport(0,0,this.atlasWidth,this.atlasHeight),t.disable(t.BLEND);{const{prog:m,uniforms:s}=this.programs.splat;t.useProgram(m),this.setCommonVolumeUniforms(s),t.uniform1f(s.uDt,a),t.uniform1f(s.uTime,this.time),t.uniform3fv(s.uDomainScale,l),t.uniform1i(s.uEmitterEnabled,e.emitterEnabled?1:0),t.uniform1f(s.uEmitterRate,e.emitterRate),t.uniform1f(s.uEmitterRadius,e.emitterRadius),t.uniform1f(s.uEmitterHeight,e.emitterHeight),t.uniform1f(s.uEmitterUpwardVel,e.emitterUpwardVelocity),t.uniform1f(s.uEmitterSwirl,e.emitterSwirl),t.uniform1f(s.uEmitterTemp,e.emitterTemperature),t.uniform1f(s.uEmitterFuel,e.emitterFuel),t.uniform1f(s.uEmitterSmoke,e.emitterSmoke),t.uniform1i(s.uBrushActive,this.brushState.active?1:0),t.uniform3fv(s.uBrushPos,this.brushState.pos),t.uniform3fv(s.uBrushVel,this.brushState.vel),t.uniform1f(s.uBrushRadius,this.brushState.radius),t.uniform1i(s.uProjectilesActive,h>0?1:0),h>0&&(t.uniform4fv(s.uProjectiles,n),t.uniform4fv(s.uProjectileVels,u));const f=this.pendingBlasts.shift();f?(t.uniform1i(s.uBlastActive,1),t.uniform3f(s.uBlastCenter,f.center[0],f.center[1],f.center[2]),t.uniform1f(s.uBlastRadius,f.radius),t.uniform1f(s.uBlastStrength,f.strength),t.uniform1f(s.uBlastTemp,f.temp),t.uniform1f(s.uBlastFuel,f.fuel),t.uniform1f(s.uBlastSmoke,f.smoke),t.uniform1f(s.uBlastLobes,f.lobes),t.uniform1f(s.uBlastSeed,f.seed),t.uniform3f(s.uBlastDirectionalVel,f.directionalVel[0],f.directionalVel[1],f.directionalVel[2])):t.uniform1i(s.uBlastActive,0),t.uniform1i(s.uObstacleType,e.obstacleType),t.uniform3f(s.uObstaclePos,e.obstacleX,e.obstacleY,e.obstacleZ),t.uniform1f(s.uObstacleRadius,e.obstacleRadius),this.bindTex(0,this.buffers.vel0,s.uVelocityTex),this.bindTex(1,this.buffers.thermo0,s.uThermoTex),t.bindFramebuffer(t.FRAMEBUFFER,this.fbos.velThermo1),t.drawArrays(t.TRIANGLES,0,3)}{const{prog:m,uniforms:s}=this.programs.advect;t.useProgram(m),this.setCommonVolumeUniforms(s),t.uniform1f(s.uDt,a),t.uniform1f(s.uTime,this.time),t.uniform1i(s.uMacCormack,e.macCormackAdvection?1:0),t.uniform1i(s.uEnclosedBox,e.enclosedBox?1:0),t.uniform3fv(s.uDomainScale,l),t.uniform1f(s.uBurnRate,e.burnRate),t.uniform1f(s.uBurnHeat,e.burnHeat),t.uniform1f(s.uSootGen,e.sootGeneration),t.uniform1f(s.uCoolingRate,e.coolingRate),t.uniform1f(s.uSmokeDissipation,e.smokeDissipation),t.uniform1f(s.uVelocityDamping,e.velocityDamping),this.bindTex(0,this.buffers.vel1,s.uVelocityTex),this.bindTex(1,this.buffers.thermo1,s.uThermoTex),t.bindFramebuffer(t.FRAMEBUFFER,this.fbos.velThermo0),t.drawArrays(t.TRIANGLES,0,3)}{const{prog:m,uniforms:s}=this.programs.curl;t.useProgram(m),this.setCommonVolumeUniforms(s),this.bindTex(0,this.buffers.vel0,s.uVelocityTex),t.bindFramebuffer(t.FRAMEBUFFER,this.fbos.curl),t.drawArrays(t.TRIANGLES,0,3)}{const{prog:m,uniforms:s}=this.programs.forces;t.useProgram(m),this.setCommonVolumeUniforms(s),t.uniform1f(s.uDt,a),t.uniform1f(s.uTime,this.time),t.uniform1f(s.uVorticityConfinement,e.vorticityConfinement),t.uniform1f(s.uBuoyancy,e.buoyancy),t.uniform1f(s.uSmokeWeight,e.smokeWeight),t.uniform1f(s.uTurbulenceStrength,e.turbulenceStrength),t.uniform1f(s.uTurbulenceScale,e.turbulenceScale),t.uniform2f(s.uWindXZ,e.windX,e.windZ),this.bindTex(0,this.buffers.vel0,s.uVelocityTex),this.bindTex(1,this.buffers.thermo0,s.uThermoTex),this.bindTex(2,this.buffers.curl,s.uCurlTex),t.bindFramebuffer(t.FRAMEBUFFER,this.fbos.vel1),t.drawArrays(t.TRIANGLES,0,3)}{const{prog:m,uniforms:s}=this.programs.divergence;t.useProgram(m),this.setCommonVolumeUniforms(s),t.uniform1f(s.uCombustionExpansion,e.combustionExpansion),this.bindTex(0,this.buffers.vel1,s.uVelocityTex),this.bindTex(1,this.buffers.thermo0,s.uThermoTex),t.bindFramebuffer(t.FRAMEBUFFER,this.fbos.div),t.drawArrays(t.TRIANGLES,0,3)}{const{prog:m,uniforms:s}=this.programs.pressure;t.useProgram(m),this.setCommonVolumeUniforms(s),this.bindTex(1,this.buffers.div,s.uDivergenceTex),this.bindTex(2,this.buffers.vel1,s.uVelocityTex);const f=Math.max(4,Math.min(50,Math.round(e.pressureIterations)));for(let v=0;v<f;v++){const b=v%2===0?this.buffers.pres0:this.buffers.pres1,x=v%2===0?this.fbos.pres1:this.fbos.pres0;this.bindTex(0,b,s.uPressureTex),t.bindFramebuffer(t.FRAMEBUFFER,x),t.drawArrays(t.TRIANGLES,0,3)}if(f%2===1){const v=this.buffers.pres0;this.buffers.pres0=this.buffers.pres1,this.buffers.pres1=v;const b=this.fbos.pres0;this.fbos.pres0=this.fbos.pres1,this.fbos.pres1=b}}{const{prog:m,uniforms:s}=this.programs.gradient;t.useProgram(m),this.setCommonVolumeUniforms(s),this.bindTex(0,this.buffers.vel1,s.uVelocityTex),this.bindTex(1,this.buffers.pres0,s.uPressureTex),t.bindFramebuffer(t.FRAMEBUFFER,this.fbos.vel0),t.drawArrays(t.TRIANGLES,0,3)}t.bindFramebuffer(t.FRAMEBUFFER,null),this.simDurationMs=performance.now()-r}render(i){const t=this.gl,e=this.params,r=this.canvas.width,a=this.canvas.height;t.bindFramebuffer(t.FRAMEBUFFER,null),t.viewport(0,0,r,a),t.disable(t.BLEND);const l=e.sunAzimuth*Math.PI/180,n=e.sunElevation*Math.PI/180,u=Math.cos(n)*Math.sin(l),h=Math.sin(n),m=Math.cos(n)*Math.cos(l),s=Math.tan(i.fovY*.5),{boxMin:f,boxMax:v,domainScale:b}=this.getBoundsBox();{const{prog:x,uniforms:d}=this.programs.raymarch;t.useProgram(x),this.setCommonVolumeUniforms(d),t.uniform3fv(d.uBoxMin,f),t.uniform3fv(d.uBoxMax,v),t.uniform3fv(d.uDomainScale,b),t.uniform3fv(d.uCamPos,i.position),t.uniform3fv(d.uCamForward,i.forward),t.uniform3fv(d.uCamRight,i.right),t.uniform3fv(d.uCamUp,i.up),t.uniform1f(d.uTanHalfFov,s),t.uniform1f(d.uAspect,i.aspect),t.uniform2f(d.uResolution,r,a),t.uniform1f(d.uTime,this.time),t.uniform1i(d.uRenderChannel,e.renderChannel),t.uniform1i(d.uColorPalette,e.colorPalette),t.uniform1i(d.uRaymarchSteps,e.raymarchSteps),t.uniform1i(d.uShadowSteps,e.shadowSteps),t.uniform1f(d.uVoxelQuantization,e.voxelQuantization),t.uniform1f(d.uDensityExtinction,e.densityExtinction),t.uniform1f(d.uSmokeAlbedo,e.smokeAlbedo),t.uniform1f(d.uShadowDensity,e.shadowDensity),t.uniform1f(d.uFireIntensity,e.fireIntensity),t.uniform1f(d.uTemperatureScale,e.temperatureScale),t.uniform1f(d.uInternalScattering,e.internalScattering),t.uniform1f(d.uPhaseAnisotropy,e.phaseAnisotropy),t.uniform1f(d.uAmbientIntensity,e.ambientIntensity),t.uniform1f(d.uSunIntensity,e.sunIntensity),t.uniform3f(d.uSunDir,u,h,m),t.uniform1f(d.uExposure,e.exposure),t.uniform1f(d.uBloomIntensity,e.bloomIntensity??.55),t.uniform1f(d.uGodRaysIntensity,e.godRaysIntensity??.45),t.uniform1f(d.uShockwaveAge,this.shockwaveAge),t.uniform3fv(d.uShockwaveCenter,this.shockwaveCenter),t.uniform1f(d.uShockwaveStrength,e.shockwaveStrength??1),t.uniform1i(d.uSliceAxis,e.sliceAxis),t.uniform1f(d.uSlicePos,e.slicePosition),t.uniform1i(d.uObstacleType,e.obstacleType),t.uniform3f(d.uObstaclePos,e.obstacleX,e.obstacleY,e.obstacleZ),t.uniform1f(d.uObstacleRadius,e.obstacleRadius),t.uniform1i(d.uTransparentExport,this.transparentExport?1:0),t.uniform1i(d.uShowVoxelGridLines,e.showVoxelGridLines?1:0),t.uniform1i(d.uShowActiveVoxelCells,e.showActiveVoxelCells?1:0),t.uniform1i(d.uShowFloorGrid,e.showFloorGrid?1:0),this.bindTex(0,this.buffers.thermo0,d.uThermoTex),this.bindTex(1,this.buffers.vel0,d.uVelocityTex),this.bindTex(2,this.buffers.curl,d.uCurlTex),this.bindTex(3,this.buffers.pres0,d.uPressureTex),t.bindVertexArray(this.quadVAO),t.drawArrays(t.TRIANGLES,0,3)}if(e.showEmbers&&e.emberCount>0&&e.renderChannel<=1){const{prog:x,uniforms:d}=this.programs.embers;t.useProgram(x),this.setCommonVolumeUniforms(d),t.uniform1f(d.uTime,this.time),t.uniform3fv(d.uBoxMin,f),t.uniform3fv(d.uBoxMax,v),t.uniform3fv(d.uCamPos,i.position),t.uniform3fv(d.uCamForward,i.forward),t.uniform3fv(d.uCamRight,i.right),t.uniform3fv(d.uCamUp,i.up),t.uniform1f(d.uTanHalfFov,s),t.uniform1f(d.uAspect,i.aspect),t.uniform1f(d.uEmberSize,e.emberSize??1),t.uniform1f(d.uEmberLifetime,e.emberLifetime??1),t.uniform1f(d.uEmberIntensity,e.emberIntensity??1.4),t.uniform1f(d.uEmberAshiness,e.emberAshiness??0),this.bindTex(0,this.buffers.vel0,d.uVelocityTex),this.bindTex(1,this.buffers.thermo0,d.uThermoTex),t.enable(t.BLEND),t.blendFuncSeparate(t.SRC_ALPHA,t.ONE,t.ONE,t.ONE_MINUS_SRC_ALPHA),t.bindVertexArray(this.emberVAO),t.drawArrays(t.POINTS,0,Math.min(this.maxEmbers,e.emberCount)),t.disable(t.BLEND)}if(e.showAtlasMinimap){const x=Math.min(210,Math.floor(r*.2)),d=Math.floor(x*(this.tilesY/this.tilesX));t.viewport(r-x-14,108,x,d),t.enable(t.BLEND),t.blendFunc(t.SRC_ALPHA,t.ONE_MINUS_SRC_ALPHA);const{prog:w,uniforms:S}=this.programs.atlasMinimap;t.useProgram(w),t.uniform1i(S.uFieldMode,e.atlasMinimapField||0),t.uniform1i(S.uTilesX,this.tilesX),t.uniform1i(S.uTilesY,this.tilesY);let C=this.buffers.thermo0;e.atlasMinimapField===1&&(C=this.buffers.vel0),e.atlasMinimapField===2&&(C=this.buffers.curl),e.atlasMinimapField===3&&(C=this.buffers.pres0),this.bindTex(0,C,S.uAtlasTex),t.bindVertexArray(this.quadVAO),t.drawArrays(t.TRIANGLES,0,3),t.disable(t.BLEND),t.viewport(0,0,r,a)}}destroy(){const i=this.gl;i.deleteVertexArray(this.quadVAO),i.deleteVertexArray(this.emberVAO),i.deleteBuffer(this.emberVBO),this.buffers&&Object.values(this.buffers).forEach(t=>t&&i.deleteTexture(t)),this.fbos&&Object.values(this.fbos).forEach(t=>t&&i.deleteFramebuffer(t)),this.programs&&Object.values(this.programs).forEach(t=>t&&i.deleteProgram(t.prog))}}class z{constructor(){this.theta=.62,this.phi=1.26,this.distance=3.35,this.target=[0,.22,0],this.fovY=46*Math.PI/180,this.aspect=16/9,this.near=.05,this.far=35,this.targetTheta=this.theta,this.targetPhi=this.phi,this.targetDistance=this.distance,this.targetCenter=[...this.target],this.position=[0,0,0],this.forward=[0,0,-1],this.right=[1,0,0],this.up=[0,1,0],this.update(1)}reset(){this.targetTheta=.62,this.targetPhi=1.26,this.targetDistance=3.35,this.targetCenter=[0,.22,0]}update(i=.016){const t=Math.min(1,i*16);this.theta+=(this.targetTheta-this.theta)*t,this.phi+=(this.targetPhi-this.phi)*t,this.distance+=(this.targetDistance-this.distance)*t;for(let d=0;d<3;d++)this.target[d]+=(this.targetCenter[d]-this.target[d])*t;const e=Math.sin(this.phi),r=Math.cos(this.phi),a=Math.sin(this.theta),l=Math.cos(this.theta);this.position[0]=this.target[0]+this.distance*e*a,this.position[1]=this.target[1]+this.distance*r,this.position[2]=this.target[2]+this.distance*e*l;const n=this.target[0]-this.position[0],u=this.target[1]-this.position[1],h=this.target[2]-this.position[2],m=Math.hypot(n,u,h)||1;this.forward[0]=n/m,this.forward[1]=u/m,this.forward[2]=h/m;const s=[0,1,0];let f=this.forward[1]*s[2]-this.forward[2]*s[1],v=this.forward[2]*s[0]-this.forward[0]*s[2],b=this.forward[0]*s[1]-this.forward[1]*s[0];const x=Math.hypot(f,v,b)||1;this.right[0]=f/x,this.right[1]=v/x,this.right[2]=b/x,this.up[0]=this.right[1]*this.forward[2]-this.right[2]*this.forward[1],this.up[1]=this.right[2]*this.forward[0]-this.right[0]*this.forward[2],this.up[2]=this.right[0]*this.forward[1]-this.right[1]*this.forward[0]}orbit(i,t){this.targetTheta-=i*.0075,this.targetPhi=Math.max(.12,Math.min(Math.PI-.08,this.targetPhi-t*.0075))}pan(i,t){const e=this.targetDistance*.0014;for(let r=0;r<3;r++)this.targetCenter[r]-=this.right[r]*i*e,this.targetCenter[r]+=this.up[r]*t*e;this.targetCenter[1]=Math.max(-.55,Math.min(2.2,this.targetCenter[1]))}zoom(i){this.targetDistance=Math.max(.85,Math.min(9.5,this.targetDistance*(1+i*.001)))}getRay(i,t){const e=Math.tan(this.fovY*.5),r=i*this.aspect*e,a=t*e,l=this.forward[0]+r*this.right[0]+a*this.up[0],n=this.forward[1]+r*this.right[1]+a*this.up[1],u=this.forward[2]+r*this.right[2]+a*this.up[2],h=Math.hypot(l,n,u)||1;return{origin:[...this.position],dir:[l/h,n/h,u/h]}}raycastVolumeUVW(i,t,e=[-.9,-.6,-.9],r=[.9,1.5,.9]){const{origin:a,dir:l}=this.getRay(i,t);let n=-1/0,u=1/0;for(let T=0;T<3;T++){const y=1/(Math.abs(l[T])<1e-6?1e-6:l[T]);let w=(e[T]-a[T])*y,S=(r[T]-a[T])*y;if(w>S){const C=w;w=S,S=C}n=Math.max(n,w),u=Math.min(u,S)}if(u<Math.max(n,0))return null;const h=Math.max(n,0),m=h+(u-h)*.45,s=a[0]+l[0]*m,f=a[1]+l[1]*m,v=a[2]+l[2]*m,b=Math.max(.06,Math.min(.94,(s-e[0])/(r[0]-e[0]))),x=Math.max(.05,Math.min(.94,(f-e[1])/(r[1]-e[1]))),d=Math.max(.06,Math.min(.94,(v-e[2])/(r[2]-e[2])));return[b,x,d]}}const J="33c5f2e13dc3d6912a8bb2d887a4e8061b401b6b",V={...L,gridResolution:48,raymarchSteps:72,renderScale:.8,showAtlasMinimap:!1,showVoxelGridLines:!1,showBoundingBox:!1,colliderAutoMove:!1},be=[{key:"emitterHeight",label:"Source height",type:"range",min:.01,max:1.5,step:.01},{key:"emitterTemperature",label:"Temperature injection",type:"range",min:0,max:9,step:.1},{key:"emitterFuel",label:"Fuel injection",type:"range",min:0,max:9,step:.1},{key:"emitterSmoke",label:"Smoke injection",type:"range",min:0,max:9,step:.1},{key:"blastFuel",label:"Burst fuel",type:"range",min:0,max:9,step:.1},{key:"blastSmoke",label:"Burst smoke",type:"range",min:0,max:9,step:.1},{key:"windZ",label:"Crosswind Z",type:"range",min:-2.5,max:2.5,step:.05},{key:"velocityDamping",label:"Velocity damping",type:"range",min:0,max:2,step:.01},{key:"sunIntensity",label:"Sun intensity",type:"range",min:0,max:8,step:.1},{key:"ambientIntensity",label:"Ambient light",type:"range",min:0,max:3,step:.05}],A=Object.fromEntries([...se.flatMap(c=>c.controls),...be].map(c=>[c.key,c])),ge={emitterEnabled:"Continuous emission",emitterRate:"Emission rate",emitterRadius:"Source radius",emitterUpwardVelocity:"Upward velocity",emitterSwirl:"Swirl",dynamicBounds:"Expand around bursts",boundsWidth:"Width / depth",boundsHeight:"Height",dynamicBoundsMax:"Expansion limit",gridResolution:"Voxel resolution",voxelQuantization:"Voxel quantization",autoGpuGovernor:"Adaptive raymarch quality",showActiveVoxelCells:"Active voxel cells",showAtlasMinimap:"Atlas minimap",atlasMinimapField:"Atlas field",pressureIterations:"Pressure iterations",timeScale:"Time scale",macCormackAdvection:"MacCormack advection",enclosedBox:"Closed domain walls",sliceAxis:"Slice axis",slicePosition:"Slice depth",vorticityConfinement:"Vorticity",buoyancy:"Buoyancy",smokeWeight:"Smoke weight",turbulenceStrength:"Turbulence strength",turbulenceScale:"Turbulence scale",burnRate:"Burn rate",burnHeat:"Heat release",sootGeneration:"Soot generation",combustionExpansion:"Combustion expansion",coolingRate:"Cooling",smokeDissipation:"Smoke dissipation",windX:"Crosswind X",renderChannel:"Render channel",colorPalette:"Colour palette",raymarchSteps:"Raymarch steps",shadowSteps:"Shadow steps",renderScale:"Viewport resolution scale",fireIntensity:"Fire intensity",bloomIntensity:"Bloom",godRaysIntensity:"Light shafts",shockwaveStrength:"Shockwave refraction",temperatureScale:"Temperature scale",internalScattering:"Internal scattering",densityExtinction:"Smoke extinction",smokeAlbedo:"Smoke albedo",shadowDensity:"Shadow density",phaseAnisotropy:"Phase anisotropy",sunElevation:"Sun elevation",sunAzimuth:"Sun azimuth",exposure:"Exposure",shrapnelEnabled:"Shrapnel streamers",blastStrength:"Shockwave velocity",blastRadius:"Burst radius",blastTemperature:"Burst temperature",blastLobes:"Lobe frequency",obstacleType:"Collider shape",obstacleX:"Position X",obstacleY:"Position Y",obstacleZ:"Position Z",colliderAutoMove:"Animate collider",colliderSpeed:"Animation speed",obstacleRadius:"Collider radius",showBoundingBox:"Domain bounds",showVoxelGridLines:"Voxel grid lines",showFloorGrid:"Studio floor",showEmbers:"Embers / ash",emberCount:"Particle count",emberSize:"Particle size",emberIntensity:"Particle brightness",emberLifetime:"Particle lifetime",emberAshiness:"Ash blend"},F={ue5_pyro_default:["Pyro plume","fire","Rolling flame · dark soot","flame"],oil_well_inferno:["Oil well inferno","fire","Pressurised fuel column","flame"],shrapnel_airburst:["Shrapnel airburst","blast","Ballistic smoke streamers","burst"],megaton_open_bounds:["Wide-bounds blast","blast","Large expanding fireball","burst"],tactical_ordnance:["Tactical detonation","blast","Flash core · dust cloud","burst"],obstacle_deflection:["Smoke deflection","smoke","Flow around a collider","smoke"],wildfire_tornado:["Wildfire tornado","fire","Spiralling emerald fire","rotate"],ashfall_motes:["Ashfall","smoke","Drifting smoke & ash","smoke"],voxelized_stylized:["Voxel fire","fire","Discrete volume shading","box"],dust_tornado:["Dust tornado","smoke","Cold debris vortex","rotate"],tyre_burnout:["Tyre burnout","smoke","Rubber smoke off a ring","cylinder"],ledge_sandfall:["Ledge sandfall","smoke","Sand poured off a slab","wall"],settling_dust:["Settling dust","smoke","Slow pale aftermath","smoke"],small_gust:["Small gust","smoke","Thin haze on a crosswind","orbit"],brick_fracture_dust:["Brick fracture","blast","Cold masonry burst","burst"],lantern_flame:["Lantern flame","fire","One small steady wick","flame"],camp_fire:["Camp fire","fire","Open wood fire with sparks","flame"],low_gpu_performance:["Lightweight plume","fire","24³ grid · lower GPU cost","flame"]};function K(c,i){if(!c.colliderAutoMove||!c.obstacleType)return[c.obstacleX,c.obstacleY,c.obstacleZ];const t=i*c.colliderSpeed;return[Math.max(.08,Math.min(.92,c.obstacleX+Math.sin(t)*.18)),c.obstacleY,Math.max(.08,Math.min(.92,c.obstacleZ+Math.sin(t*.7)*.12))]}function ee(c,i){if(!Object.hasOwn(L,c))throw new Error(`Unknown setting: ${c}`);if(typeof i!=typeof L[c])throw new Error(`Invalid type for ${c}`);if(typeof i=="boolean")return i;if(c==="interactionMode"){if(!["orbit","flamethrower","detonate"].includes(i))throw new Error("Invalid interaction tool");return i}const t=A[c];if(!Number.isFinite(i))throw new Error(`Non-finite setting: ${c}`);if(t?.type==="select"&&!t.options.some(e=>(e.id??e.value)===i))throw new Error(`Invalid choice for ${c}`);if(t?.type==="range"&&(i<t.min||i>t.max))throw new Error(`Setting outside limits: ${c}`);return i}function H(c){if(!c||c.format!=="frontier-fluid-scene"||c.version!==1||!c.params||Array.isArray(c.params)||typeof c.params!="object")throw new Error("Not a supported Fluid scene (version 1).");const i={...V};for(const[r,a]of Object.entries(c.params))i[r]=ee(r,a);const t={domain:"Gas domain",emitter:"Fire emitter",collider:"Sphere collider",sun:"Directional light"};for(const r of Object.keys(t))if(c.names?.[r]!==void 0){if(typeof c.names[r]!="string"||!c.names[r].trim()||c.names[r].length>64)throw new Error("Object names must be 1–64 characters.");t[r]=c.names[r].trim()}if(typeof c.name!="string"||!c.name.trim()||c.name.length>64)throw new Error("Scene name must be 1–64 characters.");let e=null;if(c.camera!==void 0){if(e=c.camera,!e||!["theta","phi","distance"].every(r=>Number.isFinite(e[r]))||e.phi<.01||e.phi>3.13||e.distance<.85||e.distance>9.5||Math.abs(e.theta)>1e6||!Array.isArray(e.center)||e.center.length!==3||!e.center.every(r=>Number.isFinite(r)&&Math.abs(r)<=100))throw new Error("Invalid camera position.");e={theta:e.theta,phi:e.phi,distance:e.distance,center:[...e.center]}}return{Parameters:i,Names:t,Camera:e,Name:c.name.trim()}}function xe(c){if(!Object.hasOwn(B,c))throw new Error("Unknown preset");return{...V,...B[c].params}}const p=c=>document.querySelector(c),I=()=>new Promise(c=>requestAnimationFrame(c));function ye(c,i,t,e){if(![4,16,32,64].includes(c)||![64,128,256,512].includes(i)||![12,24,30,60].includes(t)||!Number.isFinite(e)||e<0||e>3)throw new Error("Choose a supported frame count, tile size, frame rate and 0–3 second warm-up.");const r=Math.ceil(Math.sqrt(c));return{Count:c,Size:i,Rate:t,Warmup:e,Columns:r,Rows:Math.ceil(c/r),Width:r*i,Height:Math.ceil(c/r)*i}}function Se(c,i,t){const e=new Uint8ClampedArray(c.length);for(let r=0;r<i;r++)for(let a=0;a<i;a++){const l=((i-1-r)*i+a)*4,n=(r*i+a)*4,u=t?Math.max(c[l+3],c[l],c[l+1],c[l+2]):255;for(let h=0;h<3;h++)e[n+h]=u?Math.round(c[l+h]*255/u):0;e[n+3]=u}return e}function W(c,i){const t=URL.createObjectURL(c),e=document.createElement("a");e.href=t,e.download=i,e.click(),setTimeout(()=>URL.revokeObjectURL(t),1500)}class we{constructor(i){this.Editor=i,this.Result=null,this.Cancelled=!1,this.PreviewFrame=0,p("#flipbook-button").addEventListener("click",()=>{i.Switching||(p("#bake-burst").checked=!i.Parameters.emitterEnabled,p("#bake-scene-name").textContent=`${p("#document-name").value}.fluid`,p("#flipbook-dialog").showModal(),this.PreviewTime=performance.now(),this.PreviewLoop())}),p("#bake-start").addEventListener("click",()=>this.Bake()),p("#bake-cancel").addEventListener("click",()=>{this.Cancelled=!0,p("#bake-progress-label").textContent="Cancelling…"}),p("#close-flipbook").addEventListener("click",()=>this.Close()),p("#flipbook-dialog").addEventListener("cancel",t=>{i.Baking&&(t.preventDefault(),this.Cancelled=!0)}),p("#bake-frame").addEventListener("input",t=>{p("#bake-play").checked=!1,this.PreviewFrame=Number(t.target.value),this.RenderPreview()}),p("#bake-png").addEventListener("click",()=>{this.Result&&W(this.Result.Blob,`${this.Result.Name}.flipbook.png`)}),p("#bake-json").addEventListener("click",()=>{this.Result&&W(new Blob([JSON.stringify(this.Result.Metadata,null,2)],{type:"application/json"}),`${this.Result.Name}.flipbook.json`)})}Close(){if(this.Editor.Baking){this.Cancelled=!0;return}p("#flipbook-dialog").close()}async Bake(){if(this.Editor.Baking||this.Editor.Switching||!this.Editor.Engine)return;let i;try{i=ye(Number(p("#bake-count").value),Number(p("#bake-size").value),Number(p("#bake-rate").value),Number(p("#bake-warmup").value))}catch(m){p("#bake-progress-label").textContent=m.message;return}this.Editor.Baking=!0,this.Cancelled=!1,p("#bake-settings").disabled=!0,p("#bake-start").disabled=!0,p("#bake-cancel").hidden=!1,p("#bake-result").hidden=!0,p("#bake-progress").value=0,p("#bake-progress-label").textContent="Allocating an isolated WebGL2 bake…";const t=document.createElement("canvas");t.width=i.Size,t.height=i.Size;const e=p("#bake-transparent").checked,r=p("#bake-burst").checked,a={...this.Editor.Parameters},l={...a,paused:!1,autoTurntable:!1,autoGpuGovernor:!1,showBoundingBox:!1,showVoxelGridLines:!1,showActiveVoxelCells:!1,showAtlasMinimap:!1,showFloorGrid:!e&&a.showFloorGrid,renderChannel:0},n=p("#document-name").value.replace(/[^a-z0-9 _-]/gi,"").trim()||"scene",u=new z;Object.assign(u,structuredClone(this.Editor.Camera)),u.aspect=1,u.targetTheta=u.theta,u.targetPhi=u.phi,u.targetDistance=u.distance,u.targetCenter=[...u.target],u.update(1);let h;try{if(await I(),this.Cancelled)throw new Error("Bake cancelled. Live scene preserved.");h=new Q(t,l,{transparent:e});const m=document.createElement("canvas");m.width=i.Width,m.height=i.Height;const s=m.getContext("2d");if(!s)throw new Error("Cannot allocate the flipbook sheet. Try fewer or smaller frames.");const f=new Uint8Array(i.Size*i.Size*4),v=[l.obstacleX,l.obstacleY,l.obstacleZ],b=async y=>{const w=Math.max(1,Math.ceil(y*60));for(let S=0;S<w;S++){if(this.Cancelled)throw new Error("Bake cancelled. Live scene preserved.");[l.obstacleX,l.obstacleY,l.obstacleZ]=K({...l,obstacleX:v[0],obstacleY:v[1],obstacleZ:v[2]},h.time),h.stepSimulation(y/w),S%2===0&&await I()}};r&&h.triggerExplosion(),i.Warmup>0&&(p("#bake-progress-label").textContent="Warming up simulation…",await b(i.Warmup));const x=[];for(let y=0;y<i.Count;y++){await b(1/i.Rate),h.render(u);const w=h.gl;if(w.readPixels(0,0,i.Size,i.Size,w.RGBA,w.UNSIGNED_BYTE,f),w.isContextLost()||w.getError()!==w.NO_ERROR)throw new Error("GPU bake interrupted. Reduce voxel resolution or tile size and retry.");const S=y%i.Columns*i.Size,C=Math.floor(y/i.Columns)*i.Size;s.putImageData(new ImageData(Se(f,i.Size,e),i.Size,i.Size),S,C),x.push({index:y,x:S,y:C,width:i.Size,height:i.Size,simulationTime:h.time,uv:[S/i.Width,C/i.Height,i.Size/i.Width,i.Size/i.Height]}),p("#bake-progress").value=(y+1)/i.Count,p("#bake-progress-label").textContent=`Baking frame ${y+1} / ${i.Count}`,await I()}if(this.Cancelled)throw new Error("Bake cancelled. Live scene preserved.");const d=await new Promise(y=>m.toBlob(y,"image/png"));if(!d)throw new Error("PNG encoding failed. Try a smaller sheet.");if(this.Cancelled)throw new Error("Bake cancelled. Live scene preserved.");const T={format:"frontier-fluid-flipbook",version:1,name:n,sourceRevision:J,image:`${n}.flipbook.png`,width:i.Width,height:i.Height,columns:i.Columns,rows:i.Rows,frameCount:i.Count,framesPerSecond:i.Rate,playbackDuration:i.Count/i.Rate,warmup:i.Warmup,startBurst:r,origin:"top-left",uvEncoding:"normalized x, y, width, height",simulationTimeUnits:"seconds",frameOrder:"left-to-right, top-to-bottom",colourSpace:"srgb-tonemapped",alphaMode:e?"straight-opacity-and-emission-coverage":"opaque",initialization:"empty-grid; stochastic turbulence, bursts and embers are not a deterministic replay",camera:{position:u.position,forward:u.forward,up:u.up,aspect:1,fovY:u.fovY},sceneParameters:a,frames:x};this.Result={Sheet:m,Blob:d,Name:n,Metadata:T},this.PreviewFrame=0,p("#bake-frame").max=i.Count-1,p("#bake-frame").value=0,p("#bake-result-label").textContent=`${n} · ${i.Width} × ${i.Height} · ${i.Count} frames`,p("#bake-progress-label").textContent="Bake complete. Download the PNG sheet and its timing / UV metadata.",p("#bake-result").hidden=!1,this.RenderPreview()}catch(m){p("#bake-progress-label").textContent=m.message}finally{h?.destroy(),(h?.gl||t.getContext("webgl2"))?.getExtension("WEBGL_lose_context")?.loseContext(),this.Editor.Baking=!1,this.Editor.LastTime=performance.now(),p("#bake-settings").disabled=!1,p("#bake-start").disabled=!1,p("#bake-cancel").hidden=!0,p("#bake-result").hidden=!this.Result}}RenderPreview(){if(!this.Result)return;const i=this.Result.Metadata.frames[this.PreviewFrame],t=p("#bake-preview"),e=t.getContext("2d");e.clearRect(0,0,t.width,t.height),e.drawImage(this.Result.Sheet,i.x,i.y,i.width,i.height,0,0,t.width,t.height),p("#bake-frame").value=this.PreviewFrame,p("#bake-frame-label").textContent=`${this.PreviewFrame+1} / ${this.Result.Metadata.frameCount}`}PreviewLoop(){cancelAnimationFrame(this.PreviewRequest),p("#flipbook-dialog").open&&(this.Result&&!this.Editor.Baking&&p("#bake-play").checked&&performance.now()-this.PreviewTime>=1e3/this.Result.Metadata.framesPerSecond&&(this.PreviewFrame=(this.PreviewFrame+1)%this.Result.Metadata.frameCount,this.PreviewTime=performance.now(),this.RenderPreview()),this.PreviewRequest=requestAnimationFrame(()=>this.PreviewLoop()))}}function Te(c,i,t,e){const r=(m,s)=>m.reduce((f,v,b)=>f+v*s[b],0),a=Array.from({length:8},(m,s)=>{const f=[0,1,2].map(v=>(s>>v&1?i.boxMax[v]:i.boxMin[v])-c.position[v]);return[r(f,c.right),r(f,c.up),r(f,c.forward)]}),l=Math.max(c.near||.05,.001),n=Math.tan(c.fovY/2),u=m=>[(.5+m[0]/(m[2]*n*c.aspect)*.5)*t,(.5-m[1]/(m[2]*n)*.5)*e],h=[];for(let m=0;m<8;m++)for(let s=0;s<3;s++){if(m>>s&1)continue;let f=[...a[m]],v=[...a[m|1<<s]];if(f[2]<l&&v[2]<l)continue;if(f[2]<l||v[2]<l){const x=(l-f[2])/(v[2]-f[2]),d=f.map((T,y)=>T+x*(v[y]-T));f[2]<l?f=d:v=d}const b=[...u(f),...u(v)];b.every(Number.isFinite)&&h.push(b)}return h}const Ce=`
struct SimUniforms {
  gridRes: u32,
  macCormack: u32,
  enclosedBox: u32,
  emitterEnabled: u32,

  dt: f32,
  time: f32,
  emitterRate: f32,
  emitterRadius: f32,

  emitterHeight: f32,
  emitterUpwardVel: f32,
  emitterSwirl: f32,
  emitterTemp: f32,

  emitterFuel: f32,
  emitterSmoke: f32,
  blastActive: u32,
  obstacleType: u32,

  blastCenterX: f32,
  blastCenterY: f32,
  blastCenterZ: f32,
  blastRadius: f32,

  blastStrength: f32,
  blastTemp: f32,
  blastFuel: f32,
  blastSmoke: f32,

  blastLobes: f32,
  blastSeed: f32,
  burnRate: f32,
  burnHeat: f32,

  sootGen: f32,
  coolingRate: f32,
  smokeDissipation: f32,
  velocityDamping: f32,

  vorticityConfinement: f32,
  buoyancy: f32,
  smokeWeight: f32,
  combustionExpansion: f32,

  turbulenceStrength: f32,
  turbulenceScale: f32,
  windX: f32,
  windZ: f32,

  obstacleX: f32,
  obstacleY: f32,
  obstacleZ: f32,
  obstacleRadius: f32,

};

fn voxelIndex(v: vec3<i32>, res: i32) -> u32 {
  let c = clamp(v, vec3<i32>(0), vec3<i32>(res - 1));
  return u32(c.x + c.y * res + c.z * res * res);
}

fn hash33(p3_in: vec3<f32>) -> vec3<f32> {
  var p3 = fract(p3_in * vec3<f32>(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + vec3<f32>(33.33));
  return fract((p3.xxy + p3.yxx) * p3.zyx) * 2.0 - vec3<f32>(1.0);
}

fn valueNoise3D(p: vec3<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (vec3<f32>(3.0) - 2.0 * f);

  let n000 = dot(hash33(i + vec3<f32>(0.0, 0.0, 0.0)), f - vec3<f32>(0.0, 0.0, 0.0));
  let n100 = dot(hash33(i + vec3<f32>(1.0, 0.0, 0.0)), f - vec3<f32>(1.0, 0.0, 0.0));
  let n010 = dot(hash33(i + vec3<f32>(0.0, 1.0, 0.0)), f - vec3<f32>(0.0, 1.0, 0.0));
  let n110 = dot(hash33(i + vec3<f32>(1.0, 1.0, 0.0)), f - vec3<f32>(1.0, 1.0, 0.0));
  let n001 = dot(hash33(i + vec3<f32>(0.0, 0.0, 1.0)), f - vec3<f32>(0.0, 0.0, 1.0));
  let n101 = dot(hash33(i + vec3<f32>(1.0, 0.0, 1.0)), f - vec3<f32>(1.0, 0.0, 1.0));
  let n011 = dot(hash33(i + vec3<f32>(0.0, 1.0, 1.0)), f - vec3<f32>(0.0, 1.0, 1.0));
  let n111 = dot(hash33(i + vec3<f32>(1.0, 1.0, 1.0)), f - vec3<f32>(1.0, 1.0, 1.0));

  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z
  );
}

fn curlNoise3D(p: vec3<f32>) -> vec3<f32> {
  let eps = 0.25;
  let n1 = valueNoise3D(p + vec3<f32>(0.0, eps, 0.0)) - valueNoise3D(p - vec3<f32>(0.0, eps, 0.0));
  let n2 = valueNoise3D(p + vec3<f32>(0.0, 0.0, eps)) - valueNoise3D(p - vec3<f32>(0.0, 0.0, eps));
  let n3 = valueNoise3D(p + vec3<f32>(eps, 0.0, 0.0)) - valueNoise3D(p - vec3<f32>(eps, 0.0, 0.0));
  return vec3<f32>(n1 - n2, n2 - n3, n3 - n1) / (2.0 * eps);
}
`,Ee=`
${Ce}

@group(0) @binding(0) var<uniform> u: SimUniforms;
@group(0) @binding(1) var<storage, read> velIn: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> thermoIn: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> auxIn: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> outBuf0: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> outBuf1: array<vec4<f32>>;

fn sampleVelTrilinear(uvw: vec3<f32>, res: i32) -> vec4<f32> {
  let fRes = f32(res);
  let pos = clamp(uvw * fRes - vec3<f32>(0.5), vec3<f32>(0.0), vec3<f32>(fRes - 1.0001));
  let i0 = vec3<i32>(floor(pos));
  let i1 = min(i0 + vec3<i32>(1), vec3<i32>(res - 1));
  let f = pos - vec3<f32>(i0);

  let c000 = velIn[voxelIndex(vec3<i32>(i0.x, i0.y, i0.z), res)];
  let c100 = velIn[voxelIndex(vec3<i32>(i1.x, i0.y, i0.z), res)];
  let c010 = velIn[voxelIndex(vec3<i32>(i0.x, i1.y, i0.z), res)];
  let c110 = velIn[voxelIndex(vec3<i32>(i1.x, i1.y, i0.z), res)];
  let c001 = velIn[voxelIndex(vec3<i32>(i0.x, i0.y, i1.z), res)];
  let c101 = velIn[voxelIndex(vec3<i32>(i1.x, i0.y, i1.z), res)];
  let c011 = velIn[voxelIndex(vec3<i32>(i0.x, i1.y, i1.z), res)];
  let c111 = velIn[voxelIndex(vec3<i32>(i1.x, i1.y, i1.z), res)];

  return mix(
    mix(mix(c000, c100, f.x), mix(c010, c110, f.x), f.y),
    mix(mix(c001, c101, f.x), mix(c011, c111, f.x), f.y),
    f.z
  );
}

fn sampleThermoTrilinear(uvw: vec3<f32>, res: i32) -> vec4<f32> {
  let fRes = f32(res);
  let pos = clamp(uvw * fRes - vec3<f32>(0.5), vec3<f32>(0.0), vec3<f32>(fRes - 1.0001));
  let i0 = vec3<i32>(floor(pos));
  let i1 = min(i0 + vec3<i32>(1), vec3<i32>(res - 1));
  let f = pos - vec3<f32>(i0);

  let c000 = thermoIn[voxelIndex(vec3<i32>(i0.x, i0.y, i0.z), res)];
  let c100 = thermoIn[voxelIndex(vec3<i32>(i1.x, i0.y, i0.z), res)];
  let c010 = thermoIn[voxelIndex(vec3<i32>(i0.x, i1.y, i0.z), res)];
  let c110 = thermoIn[voxelIndex(vec3<i32>(i1.x, i1.y, i0.z), res)];
  let c001 = thermoIn[voxelIndex(vec3<i32>(i0.x, i0.y, i1.z), res)];
  let c101 = thermoIn[voxelIndex(vec3<i32>(i1.x, i0.y, i1.z), res)];
  let c011 = thermoIn[voxelIndex(vec3<i32>(i0.x, i1.y, i1.z), res)];
  let c111 = thermoIn[voxelIndex(vec3<i32>(i1.x, i1.y, i1.z), res)];

  return mix(
    mix(mix(c000, c100, f.x), mix(c010, c110, f.x), f.y),
    mix(mix(c001, c101, f.x), mix(c011, c111, f.x), f.y),
    f.z
  );
}

fn computeObstacleMask(uvw: vec3<f32>) -> f32 {
  if (u.obstacleType == 0u) { return 0.0; }
  let obsPos = vec3<f32>(u.obstacleX, u.obstacleY, u.obstacleZ);
  let d = uvw - obsPos;
  let rad = u.obstacleRadius;
  if (u.obstacleType == 1u) {
    return select(0.0, 1.0, length(d) < rad);
  } else if (u.obstacleType == 2u) {
    return select(0.0, 1.0, length(d.xz) < rad * 0.75 && uvw.y < obsPos.y + rad * 1.8);
  } else if (u.obstacleType == 3u) {
    return select(0.0, 1.0, length(d.yz) < rad * 0.72 && abs(d.x) < rad * 1.9);
  } else if (u.obstacleType == 4u) {
    let b = vec3<f32>(rad * 1.5, rad * 0.45, rad * 1.5);
    let q = abs(d) - b;
    return select(0.0, 1.0, max(max(q.x, q.y), q.z) < 0.0);
  }
  return 0.0;
}

@compute @workgroup_size(4, 4, 4)
fn csSplat(@builtin(global_invocation_id) gid: vec3<u32>) {
  let res = i32(u.gridRes);
  let v = vec3<i32>(gid);
  if (v.x >= res || v.y >= res || v.z >= res) { return; }

  let idx = voxelIndex(v, res);
  let uvw = (vec3<f32>(v) + vec3<f32>(0.5)) / f32(res);

  var vel = velIn[idx];
  var thermo = thermoIn[idx];

  if (computeObstacleMask(uvw) > 0.5) {
    outBuf0[idx] = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    outBuf1[idx] = vec4<f32>(0.0);
    return;
  }
  vel.a = 0.0;

  if (u.emitterEnabled == 1u && u.emitterRate > 0.001) {
    let emitPos = vec3<f32>(0.5, u.emitterHeight, 0.5);
    let diff = uvw - emitPos;
    let dist = length(vec3<f32>(diff.x, diff.y * 1.45, diff.z));
    if (dist < u.emitterRadius * 1.35) {
      let falloff = smoothstep(u.emitterRadius * 1.35, u.emitterRadius * 0.15, dist);
      let np = uvw * 11.0 + vec3<f32>(0.0, -u.time * 5.5, u.time * 1.7);
      let n = 0.55 + 0.45 * valueNoise3D(np);
      let rate = falloff * u.emitterRate * n;

      thermo.r = max(thermo.r, u.emitterSmoke * falloff * (0.6 + 0.4 * n));
      thermo.g = max(thermo.g, u.emitterTemp * rate);
      thermo.b = max(thermo.b, u.emitterFuel * rate);
      thermo.a = max(thermo.a, u.emitterFuel * rate * 0.9);

      let tangent = vec3<f32>(-diff.z, 0.0, diff.x) / max(length(diff.xz), 0.02);
      let turb = hash33(np) * 0.65;
      let targetVel = vec3<f32>(0.0, u.emitterUpwardVel * (0.75 + 0.5 * n), 0.0)
                    + tangent * u.emitterSwirl * (dist / max(u.emitterRadius, 0.01))
                    + turb;
      let blend = clamp(falloff * u.dt * 14.0, 0.0, 0.85);
      vel = vec4<f32>(mix(vel.xyz, targetVel, blend), 0.0);
    }
  }

  if (u.blastActive == 1u) {
    let blastCenter = vec3<f32>(u.blastCenterX, u.blastCenterY, u.blastCenterZ);
    let diff = uvw - blastCenter;
    let r = length(diff);
    let dir = select(vec3<f32>(0.0, 1.0, 0.0), diff / r, r > 1e-4);

    let lobeCoord = dir * u.blastLobes + vec3<f32>(u.blastSeed * 7.13, u.blastSeed * 3.71, u.blastSeed * 5.39);
    let lobeNoise = valueNoise3D(lobeCoord) * 0.35 + valueNoise3D(lobeCoord * 2.1) * 0.18;
    let effectiveRadius = u.blastRadius * (1.0 + lobeNoise);

    if (r < effectiveRadius * 1.25) {
      let coreMask = smoothstep(effectiveRadius, effectiveRadius * 0.1, r);
      let shellMask = smoothstep(effectiveRadius * 1.2, effectiveRadius * 0.45, r) *
                      smoothstep(0.0, effectiveRadius * 0.5, r);

      thermo.r += u.blastSmoke * (shellMask * 0.9 + coreMask * 0.45);
      thermo.g = max(thermo.g, u.blastTemp * coreMask * (1.0 + 0.3 * lobeNoise));
      thermo.b = max(thermo.b, u.blastFuel * coreMask);
      thermo.a = max(thermo.a, u.blastTemp * coreMask);

      let curlPerturb = curlNoise3D(uvw * 9.0 + vec3<f32>(u.blastSeed * 11.0)) * 0.45;
      let blastVel = (dir + vec3<f32>(0.0, 0.38, 0.0) + curlPerturb) * u.blastStrength *
                     smoothstep(effectiveRadius * 1.25, effectiveRadius * 0.12, r);
      vel = vec4<f32>(vel.xyz + blastVel, 0.0);
    }
  }

  outBuf0[idx] = vel;
  outBuf1[idx] = thermo;
}

@compute @workgroup_size(4, 4, 4)
fn csAdvect(@builtin(global_invocation_id) gid: vec3<u32>) {
  let res = i32(u.gridRes);
  let v = vec3<i32>(gid);
  if (v.x >= res || v.y >= res || v.z >= res) { return; }

  let idx = voxelIndex(v, res);
  let curVel = velIn[idx];
  if (curVel.a > 0.5) {
    outBuf0[idx] = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    outBuf1[idx] = vec4<f32>(0.0);
    return;
  }

  let uvw = (vec3<f32>(v) + vec3<f32>(0.5)) / f32(res);
  let backUVW = uvw - curVel.xyz * (u.dt * 0.28);

  let advVel = sampleVelTrilinear(backUVW, res);
  var advThermo = sampleThermoTrilinear(backUVW, res);

  if (u.macCormack == 1u) {
    let fwdUVW = backUVW + advVel.xyz * (u.dt * 0.28);
    let backFwdThermo = sampleThermoTrilinear(fwdUVW, res);
    let curThermo = thermoIn[idx];
    let corrThermo = advThermo + 0.45 * (curThermo - backFwdThermo);

    let nL = thermoIn[voxelIndex(v + vec3<i32>(-1, 0, 0), res)];
    let nR = thermoIn[voxelIndex(v + vec3<i32>( 1, 0, 0), res)];
    let nD = thermoIn[voxelIndex(v + vec3<i32>( 0,-1, 0), res)];
    let nU = thermoIn[voxelIndex(v + vec3<i32>( 0, 1, 0), res)];
    let nB = thermoIn[voxelIndex(v + vec3<i32>( 0, 0,-1), res)];
    let nF = thermoIn[voxelIndex(v + vec3<i32>( 0, 0, 1), res)];

    let minVal = min(curThermo, min(min(nL, nR), min(min(nD, nU), min(nB, nF))));
    let maxVal = max(curThermo, max(max(nL, nR), max(max(nD, nU), max(nB, nF))));
    advThermo = clamp(corrThermo, minVal, maxVal);
  }

  var smoke = max(0.0, advThermo.r);
  var temp  = max(0.0, advThermo.g);
  var fuel  = max(0.0, advThermo.b);

  let ignitionFactor = smoothstep(0.08, 0.65, temp + fuel * 0.5);
  let burnedFuel = min(fuel, fuel * u.burnRate * (0.65 + 0.65 * ignitionFactor) * u.dt);
  fuel = max(0.0, fuel - burnedFuel);

  temp += burnedFuel * u.burnHeat;
  smoke += burnedFuel * u.sootGen;

  let radiativeCool = u.coolingRate * (0.55 * temp + 0.14 * temp * temp) * u.dt;
  temp = max(0.0, temp - radiativeCool);

  smoke = max(0.0, smoke * exp(-u.smokeDissipation * u.dt));
  fuel  = max(0.0, fuel  * exp(-0.15 * u.dt));

  let reaction = burnedFuel / max(u.dt, 1e-4);

  if (u.enclosedBox == 0u) {
    let edgeDistX = min(uvw.x, 1.0 - uvw.x);
    let edgeDistZ = min(uvw.z, 1.0 - uvw.z);
    let topDist = 1.0 - uvw.y;
    let sponge = smoothstep(0.0, 0.055, min(edgeDistX, edgeDistZ)) * smoothstep(0.0, 0.045, topDist);
    smoke *= sponge;
    temp  *= sponge;
    fuel  *= sponge;
  }

  var nextVel = advVel.xyz * exp(-u.velocityDamping * u.dt);
  if (v.y <= 1 && nextVel.y < 0.0) { nextVel.y = 0.0; }

  outBuf0[idx] = vec4<f32>(nextVel, 0.0);
  outBuf1[idx] = vec4<f32>(smoke, temp, fuel, reaction);
}

@compute @workgroup_size(4, 4, 4)
fn csCurl(@builtin(global_invocation_id) gid: vec3<u32>) {
  let res = i32(u.gridRes);
  let v = vec3<i32>(gid);
  if (v.x >= res || v.y >= res || v.z >= res) { return; }

  let vL = velIn[voxelIndex(v + vec3<i32>(-1, 0, 0), res)].xyz;
  let vR = velIn[voxelIndex(v + vec3<i32>( 1, 0, 0), res)].xyz;
  let vD = velIn[voxelIndex(v + vec3<i32>( 0,-1, 0), res)].xyz;
  let vU = velIn[voxelIndex(v + vec3<i32>( 0, 1, 0), res)].xyz;
  let vB = velIn[voxelIndex(v + vec3<i32>( 0, 0,-1), res)].xyz;
  let vF = velIn[voxelIndex(v + vec3<i32>( 0, 0, 1), res)].xyz;

  let curl = 0.5 * vec3<f32>(
    (vU.z - vD.z) - (vF.y - vB.y),
    (vF.x - vB.x) - (vR.z - vL.z),
    (vR.y - vL.y) - (vU.x - vD.x)
  );
  outBuf0[voxelIndex(v, res)] = vec4<f32>(curl, length(curl));
}

@compute @workgroup_size(4, 4, 4)
fn csForces(@builtin(global_invocation_id) gid: vec3<u32>) {
  let res = i32(u.gridRes);
  let v = vec3<i32>(gid);
  if (v.x >= res || v.y >= res || v.z >= res) { return; }

  let idx = voxelIndex(v, res);
  let vel = velIn[idx];
  if (vel.a > 0.5) {
    outBuf0[idx] = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    return;
  }

  let thermo = thermoIn[idx];
  let smoke = thermo.r;
  let temp  = thermo.g;
  let fuel  = thermo.b;

  let cL = auxIn[voxelIndex(v + vec3<i32>(-1, 0, 0), res)].a;
  let cR = auxIn[voxelIndex(v + vec3<i32>( 1, 0, 0), res)].a;
  let cD = auxIn[voxelIndex(v + vec3<i32>( 0,-1, 0), res)].a;
  let cU = auxIn[voxelIndex(v + vec3<i32>( 0, 1, 0), res)].a;
  let cB = auxIn[voxelIndex(v + vec3<i32>( 0, 0,-1), res)].a;
  let cF = auxIn[voxelIndex(v + vec3<i32>( 0, 0, 1), res)].a;

  let gradMag = 0.5 * vec3<f32>(cR - cL, cU - cD, cF - cB);
  let gradLen = length(gradMag);
  let N = select(vec3<f32>(0.0), gradMag / gradLen, gradLen > 1e-5);
  let omega = auxIn[idx].xyz;
  let vortForce = u.vorticityConfinement * cross(N, omega);

  let buoyForceY = u.buoyancy * temp - u.smokeWeight * smoke * 0.45;

  let tL = thermoIn[voxelIndex(v + vec3<i32>(-1, 0, 0), res)].g;
  let tR = thermoIn[voxelIndex(v + vec3<i32>( 1, 0, 0), res)].g;
  let tB = thermoIn[voxelIndex(v + vec3<i32>( 0, 0,-1), res)].g;
  let tF = thermoIn[voxelIndex(v + vec3<i32>( 0, 0, 1), res)].g;
  let baroclinic = vec3<f32>(tR - tL, 0.0, tF - tB) * (0.35 * u.buoyancy);

  let uvw = (vec3<f32>(v) + vec3<f32>(0.5)) / f32(res);
  let activity = clamp(smoke * 0.6 + temp * 0.8 + fuel * 0.5, 0.0, 1.5);
  let noiseCoord = uvw * u.turbulenceScale + vec3<f32>(u.time * 0.65, -u.time * 1.35, u.time * 0.45);
  let subGridTurb = curlNoise3D(noiseCoord) * u.turbulenceStrength * activity;
  let windForce = vec3<f32>(u.windX, 0.0, u.windZ) * activity * smoothstep(0.05, 0.65, uvw.y);

  var nextVel = vel.xyz + (vortForce + vec3<f32>(0.0, buoyForceY, 0.0) + baroclinic + subGridTurb + windForce) * u.dt;
  let speed = length(nextVel);
  if (speed > 18.0) { nextVel = (nextVel / speed) * 18.0; }

  outBuf0[idx] = vec4<f32>(nextVel, 0.0);
}

@compute @workgroup_size(4, 4, 4)
fn csDivergence(@builtin(global_invocation_id) gid: vec3<u32>) {
  let res = i32(u.gridRes);
  let v = vec3<i32>(gid);
  if (v.x >= res || v.y >= res || v.z >= res) { return; }

  let idx = voxelIndex(v, res);
  let vL = velIn[voxelIndex(v + vec3<i32>(-1, 0, 0), res)];
  let vR = velIn[voxelIndex(v + vec3<i32>( 1, 0, 0), res)];
  let vD = velIn[voxelIndex(v + vec3<i32>( 0,-1, 0), res)];
  let vU = velIn[voxelIndex(v + vec3<i32>( 0, 1, 0), res)];
  let vB = velIn[voxelIndex(v + vec3<i32>( 0, 0,-1), res)];
  let vF = velIn[voxelIndex(v + vec3<i32>( 0, 0, 1), res)];

  let uL = select(vL.xyz, vec3<f32>(0.0), vL.a > 0.5);
  let uR = select(vR.xyz, vec3<f32>(0.0), vR.a > 0.5);
  let uD = select(vD.xyz, vec3<f32>(0.0), vD.a > 0.5 || v.y == 0);
  let uU = select(vU.xyz, vec3<f32>(0.0), vU.a > 0.5);
  let uB = select(vB.xyz, vec3<f32>(0.0), vB.a > 0.5);
  let uF = select(vF.xyz, vec3<f32>(0.0), vF.a > 0.5);

  let div = 0.5 * ((uR.x - uL.x) + (uU.y - uD.y) + (uF.z - uB.z));
  let thermo = thermoIn[idx];
  let expansion = thermo.a * u.combustionExpansion * 0.08;
  let fireSource = clamp(thermo.g * 0.45 + thermo.b * 0.35, 0.0, 6.0);

  outBuf0[idx] = vec4<f32>(div - expansion, fireSource, 0.0, 0.0);
}

@compute @workgroup_size(4, 4, 4)
fn csPressure(@builtin(global_invocation_id) gid: vec3<u32>) {
  let res = i32(u.gridRes);
  let v = vec3<i32>(gid);
  if (v.x >= res || v.y >= res || v.z >= res) { return; }

  let idx = voxelIndex(v, res);
  let centerP = thermoIn[idx]; // thermoIn bound to pressureIn here
  let divSample = auxIn[idx];  // auxIn bound to divergenceBuf here

  let iL = voxelIndex(v + vec3<i32>(-1, 0, 0), res);
  let iR = voxelIndex(v + vec3<i32>( 1, 0, 0), res);
  let iD = voxelIndex(v + vec3<i32>( 0,-1, 0), res);
  let iU = voxelIndex(v + vec3<i32>( 0, 1, 0), res);
  let iB = voxelIndex(v + vec3<i32>( 0, 0,-1), res);
  let iF = voxelIndex(v + vec3<i32>( 0, 0, 1), res);

  let pL = select(thermoIn[iL].rg, centerP.rg, velIn[iL].a > 0.5);
  let pR = select(thermoIn[iR].rg, centerP.rg, velIn[iR].a > 0.5);
  let pD = select(thermoIn[iD].rg, centerP.rg, velIn[iD].a > 0.5 || v.y == 0);
  let pU = select(thermoIn[iU].rg, centerP.rg, velIn[iU].a > 0.5);
  let pB = select(thermoIn[iB].rg, centerP.rg, velIn[iB].a > 0.5);
  let pF = select(thermoIn[iF].rg, centerP.rg, velIn[iF].a > 0.5);

  let pNew = (pL.x + pR.x + pD.x + pU.x + pB.x + pF.x - divSample.r) / 6.0;
  let irrNew = (pL.y + pR.y + pD.y + pU.y + pB.y + pF.y + divSample.g * 0.55) / 6.28;

  outBuf0[idx] = vec4<f32>(pNew, irrNew, 0.0, 1.0);
}

@compute @workgroup_size(4, 4, 4)
fn csGradient(@builtin(global_invocation_id) gid: vec3<u32>) {
  let res = i32(u.gridRes);
  let v = vec3<i32>(gid);
  if (v.x >= res || v.y >= res || v.z >= res) { return; }

  let idx = voxelIndex(v, res);
  var vel = velIn[idx];
  if (vel.a > 0.5) {
    outBuf0[idx] = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    return;
  }

  let pC = thermoIn[idx].r; // thermoIn bound to pressureBuf here
  let iL = voxelIndex(v + vec3<i32>(-1, 0, 0), res);
  let iR = voxelIndex(v + vec3<i32>( 1, 0, 0), res);
  let iD = voxelIndex(v + vec3<i32>( 0,-1, 0), res);
  let iU = voxelIndex(v + vec3<i32>( 0, 1, 0), res);
  let iB = voxelIndex(v + vec3<i32>( 0, 0,-1), res);
  let iF = voxelIndex(v + vec3<i32>( 0, 0, 1), res);

  let sL = velIn[iL].a;
  let sR = velIn[iR].a;
  let sD = velIn[iD].a;
  let sU = velIn[iU].a;
  let sB = velIn[iB].a;
  let sF = velIn[iF].a;

  let pL = select(thermoIn[iL].r, pC, sL > 0.5);
  let pR = select(thermoIn[iR].r, pC, sR > 0.5);
  let pD = select(thermoIn[iD].r, pC, sD > 0.5 || v.y == 0);
  let pU = select(thermoIn[iU].r, pC, sU > 0.5);
  let pB = select(thermoIn[iB].r, pC, sB > 0.5);
  let pF = select(thermoIn[iF].r, pC, sF > 0.5);

  var vNew = vel.xyz - 0.5 * vec3<f32>(pR - pL, pU - pD, pF - pB);
  if ((sL > 0.5 && vNew.x < 0.0) || (sR > 0.5 && vNew.x > 0.0)) { vNew.x = 0.0; }
  if ((sD > 0.5 && vNew.y < 0.0) || (sU > 0.5 && vNew.y > 0.0)) { vNew.y = 0.0; }
  if ((sB > 0.5 && vNew.z < 0.0) || (sF > 0.5 && vNew.z > 0.0)) { vNew.z = 0.0; }

  outBuf0[idx] = vec4<f32>(vNew, 0.0);
}

`,ke=`
struct RenderUniforms {
  camPos: vec3<f32>,
  tanHalfFov: f32,
  camForward: vec3<f32>,
  aspect: f32,
  camRight: vec3<f32>,
  time: f32,
  camUp: vec3<f32>,
  gridRes: u32,

  sunDir: vec3<f32>,
  voxelQuantization: f32,

  renderChannel: u32,
  colorPalette: u32,
  raymarchSteps: u32,
  shadowSteps: u32,

  densityExtinction: f32,
  smokeAlbedo: f32,
  shadowDensity: f32,
  fireIntensity: f32,

  temperatureScale: f32,
  internalScattering: f32,
  phaseAnisotropy: f32,
  ambientIntensity: f32,

  sunIntensity: f32,
  exposure: f32,
  sliceAxis: u32,
  slicePos: f32,

  obstacleType: u32,
  obstacleX: f32,
  obstacleY: f32,
  obstacleZ: f32,

  obstacleRadius: f32,
  showBoundingBox: u32,
  showVoxelGridLines: u32,
  showFloorGrid: u32,

  boxMin: vec3<f32>,
  pad0: f32,
  boxMax: vec3<f32>,
  pad1: f32,

};

@group(0) @binding(0) var<uniform> r: RenderUniforms;
@group(0) @binding(1) var<storage, read> thermoBuf: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> velBuf: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> curlBuf: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> presBuf: array<vec4<f32>>;

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vsMain(@builtin(vertex_index) vid: u32) -> VSOut {
  let x = f32((vid & 1u) << 2u) - 1.0;
  let y = f32((vid & 2u) << 1u) - 1.0;
  var out: VSOut;
  out.pos = vec4<f32>(x, y, 0.0, 1.0);
  out.uv = vec2<f32>(x * 0.5 + 0.5, y * 0.5 + 0.5);
  return out;
}

fn voxelIndex(v: vec3<i32>, res: i32) -> u32 {
  let c = clamp(v, vec3<i32>(0), vec3<i32>(res - 1));
  return u32(c.x + c.y * res + c.z * res * res);
}

fn sampleThermo(uvw: vec3<f32>, quantize: f32) -> vec4<f32> {
  let res = i32(r.gridRes);
  let fRes = f32(res);
  let c = clamp(uvw, vec3<f32>(0.0), vec3<f32>(0.9999));
  if (quantize >= 0.99) {
    return thermoBuf[voxelIndex(vec3<i32>(floor(c * fRes)), res)];
  }
  let pos = clamp(c * fRes - vec3<f32>(0.5), vec3<f32>(0.0), vec3<f32>(fRes - 1.0001));
  let i0 = vec3<i32>(floor(pos));
  let i1 = min(i0 + vec3<i32>(1), vec3<i32>(res - 1));
  let f = pos - vec3<f32>(i0);

  let c000 = thermoBuf[voxelIndex(vec3<i32>(i0.x, i0.y, i0.z), res)];
  let c100 = thermoBuf[voxelIndex(vec3<i32>(i1.x, i0.y, i0.z), res)];
  let c010 = thermoBuf[voxelIndex(vec3<i32>(i0.x, i1.y, i0.z), res)];
  let c110 = thermoBuf[voxelIndex(vec3<i32>(i1.x, i1.y, i0.z), res)];
  let c001 = thermoBuf[voxelIndex(vec3<i32>(i0.x, i0.y, i1.z), res)];
  let c101 = thermoBuf[voxelIndex(vec3<i32>(i1.x, i0.y, i1.z), res)];
  let c011 = thermoBuf[voxelIndex(vec3<i32>(i0.x, i1.y, i1.z), res)];
  let c111 = thermoBuf[voxelIndex(vec3<i32>(i1.x, i1.y, i1.z), res)];

  let tri = mix(
    mix(mix(c000, c100, f.x), mix(c010, c110, f.x), f.y),
    mix(mix(c001, c101, f.x), mix(c011, c111, f.x), f.y),
    f.z
  );
  if (quantize <= 0.01) { return tri; }
  let nearest = thermoBuf[voxelIndex(vec3<i32>(floor(c * fRes)), res)];
  return mix(tri, nearest, quantize);
}

fn samplePres(uvw: vec3<f32>) -> vec4<f32> {
  let res = i32(r.gridRes);
  let fRes = f32(res);
  let pos = clamp(uvw * fRes - vec3<f32>(0.5), vec3<f32>(0.0), vec3<f32>(fRes - 1.0001));
  let i0 = vec3<i32>(floor(pos));
  let i1 = min(i0 + vec3<i32>(1), vec3<i32>(res - 1));
  let f = pos - vec3<f32>(i0);
  let c000 = presBuf[voxelIndex(vec3<i32>(i0.x, i0.y, i0.z), res)];
  let c111 = presBuf[voxelIndex(vec3<i32>(i1.x, i1.y, i1.z), res)];
  return mix(c000, c111, (f.x + f.y + f.z) * 0.3333);
}

fn evaluateBlackbodyPalette(tempRaw: f32, palette: u32) -> vec3<f32> {
  let t = clamp(tempRaw * r.temperatureScale * 0.28, 0.0, 1.6);
  if (t <= 0.01) { return vec3<f32>(0.0); }

  if (palette == 0u || palette == 1u) {
    let c1 = vec3<f32>(0.55, 0.03, 0.005);
    let c2 = vec3<f32>(1.00, 0.24, 0.01);
    let c3 = vec3<f32>(1.00, 0.68, 0.10);
    let c4 = vec3<f32>(1.00, 0.96, 0.78);
    var col = mix(vec3<f32>(0.0), c1, smoothstep(0.0, 0.22, t));
    col = mix(col, c2, smoothstep(0.18, 0.52, t));
    col = mix(col, c3, smoothstep(0.48, 0.88, t));
    col = mix(col, c4, smoothstep(0.82, 1.35, t));
    return col * (t * t * 1.65);
  } else if (palette == 2u) {
    let col = vec3<f32>(
      smoothstep(0.01, 0.22, t),
      smoothstep(0.10, 0.55, t),
      smoothstep(0.28, 0.95, t) * 1.15
    );
    return col * (t * t * 2.1);
  } else if (palette == 3u) {
    let c1 = vec3<f32>(0.02, 0.38, 0.08);
    let c2 = vec3<f32>(0.14, 0.95, 0.28);
    let c3 = vec3<f32>(0.72, 1.00, 0.45);
    var col = mix(vec3<f32>(0.0), c1, smoothstep(0.0, 0.25, t));
    col = mix(col, c2, smoothstep(0.22, 0.58, t));
    col = mix(col, c3, smoothstep(0.55, 1.25, t));
    return col * (t * t * 1.7);
  } else if (palette == 4u) {
    let c1 = vec3<f32>(0.04, 0.12, 0.65);
    let c2 = vec3<f32>(0.08, 0.58, 1.00);
    let c3 = vec3<f32>(0.55, 0.95, 1.00);
    var col = mix(vec3<f32>(0.0), c1, smoothstep(0.0, 0.25, t));
    col = mix(col, c2, smoothstep(0.22, 0.58, t));
    col = mix(col, c3, smoothstep(0.55, 1.25, t));
    return col * (t * t * 1.85);
  } else {
    let c1 = vec3<f32>(0.32, 0.02, 0.48);
    let c2 = vec3<f32>(0.88, 0.08, 0.65);
    let c3 = vec3<f32>(1.00, 0.55, 0.92);
    var col = mix(vec3<f32>(0.0), c1, smoothstep(0.0, 0.25, t));
    col = mix(col, c2, smoothstep(0.22, 0.58, t));
    col = mix(col, c3, smoothstep(0.55, 1.25, t));
    return col * (t * t * 1.75);
  }
}

fn intersectBox(ro: vec3<f32>, rd: vec3<f32>, bMin: vec3<f32>, bMax: vec3<f32>) -> vec2<f32> {
  let invRd = 1.0 / rd;
  let t0 = (bMin - ro) * invRd;
  let t1 = (bMax - ro) * invRd;
  let tSmaller = min(t0, t1);
  let tBigger  = max(t0, t1);
  let tNear = max(max(tSmaller.x, tSmaller.y), tSmaller.z);
  let tFar  = min(min(tBigger.x, tBigger.y), tBigger.z);
  return vec2<f32>(tNear, tFar);
}

fn marchSunTransmittance(startUVW: vec3<f32>, quantize: f32) -> f32 {
  var stepLen = 0.065;
  var opticalDepth = 0.0;
  var pos = startUVW;
  for (var i = 0u; i < 12u; i = i + 1u) {
    if (i >= r.shadowSteps) { break; }
    pos += r.sunDir * stepLen;
    if (any(pos < vec3<f32>(0.0)) || any(pos > vec3<f32>(1.0))) { break; }
    let d = sampleThermo(pos, quantize).r;
    opticalDepth += max(0.0, d) * stepLen * r.shadowDensity;
    stepLen *= 1.25;
  }
  let primary = exp(-opticalDepth);
  let secondary = exp(-opticalDepth * 0.28) * 0.65;
  return mix(primary, max(primary, secondary), 0.48);
}

fn acesToneMap(x: vec3<f32>) -> vec3<f32> {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3<f32>(0.0), vec3<f32>(1.0));
}

@fragment
fn fsMain(in: VSOut) -> @location(0) vec4<f32> {
  let boxMin = r.boxMin;
  let boxMax = r.boxMax;

  let ndc = in.uv * 2.0 - vec2<f32>(1.0);
  let rayOrigin = r.camPos;
  let rayDir = normalize(
    r.camForward +
    ndc.x * r.aspect * r.tanHalfFov * r.camRight +
    ndc.y * r.tanHalfFov * r.camUp
  );

  let skyGrad = clamp(rayDir.y * 0.5 + 0.5, 0.0, 1.0);
  var bgSky = mix(vec3<f32>(0.035, 0.04, 0.052), vec3<f32>(0.012, 0.015, 0.022), pow(skyGrad, 0.7));

  var tGround = 1e9;
  if (r.showFloorGrid == 1u && rayDir.y < -1e-4) {
    let tg = (boxMin.y - rayOrigin.y) / rayDir.y;
    if (tg > 0.0 && tg < 18.0) {
      let gp = rayOrigin + rayDir * tg;
      if (max(abs(gp.x), abs(gp.z)) < 4.5) {
        tGround = tg;
        let radialFade = 1.0 - smoothstep(1.2, 4.2, length(gp.xz));
        let inFootprint = step(abs(gp.x), 0.5) * step(abs(gp.z), 0.5);
        let floorBase = mix(vec3<f32>(0.028, 0.032, 0.040), vec3<f32>(0.045, 0.052, 0.065), inFootprint);
        let sampleAbove = clamp((vec3<f32>(gp.x, boxMin.y + 0.16, gp.z) - boxMin) / (boxMax - boxMin), vec3<f32>(0.0), vec3<f32>(1.0));
        let bounceIrr = samplePres(sampleAbove).g;
        let pyroBounce = evaluateBlackbodyPalette(max(0.85, bounceIrr * 1.4), r.colorPalette) * bounceIrr * 0.45;
        let bounceCol = pyroBounce;
        bgSky = mix(bgSky, floorBase + bounceCol, radialFade);
      }
    }
  }

  let boxHit = intersectBox(rayOrigin, rayDir, boxMin, boxMax);
  let tEnter = max(boxHit.x, 0.0);
  let tExit  = min(boxHit.y, tGround);

  if (tExit <= tEnter) {
    let mapped = acesToneMap(bgSky * r.exposure);
    return vec4<f32>(pow(mapped, vec3<f32>(1.0 / 2.2)), 1.0);
  }

  let numSteps = r.raymarchSteps;
  let baseStepSize = 1.65 / f32(numSteps);
  let jitter = fract(52.9829189 * fract(dot(in.pos.xy, vec2<f32>(0.06711056, 0.00583715))));
  var t = tEnter + jitter * baseStepSize;

  var accumLight = vec3<f32>(0.0);
  var transmittance = 1.0;

  let sunLightColor = vec3<f32>(1.0, 0.93, 0.82) * r.sunIntensity;
  let skyAmbientColor = vec3<f32>(0.30, 0.38, 0.52) * r.ambientIntensity;
  let quantize = select(r.voxelQuantization, 1.0, r.renderChannel == 1u);


  for (var i = 0u; i < 160u; i = i + 1u) {
    if (i >= numSteps || t >= tExit) { break; }
    let pWorld = rayOrigin + rayDir * t;
    let uvw = (pWorld - boxMin) / (boxMax - boxMin);

    let thermo = sampleThermo(uvw, quantize);
    let smoke = thermo.r;
    let temp  = thermo.g;
    let react = thermo.a;

    if (smoke > 0.004 || temp > 0.015) {
      let extinction = max(0.001, smoke * r.densityExtinction + temp * 0.65);
      let stepTrans = exp(-extinction * baseStepSize);

      let sunTrans = marchSunTransmittance(uvw, quantize);
      let powder = 1.0 - 0.45 * exp(-smoke * r.densityExtinction * 2.2);
      let directSunScatter = sunLightColor * sunTrans * powder * 0.65;
      let ambientScatter = skyAmbientColor * mix(0.45, 1.15, uvw.y);

      let fireIrr = samplePres(uvw).g;
      let internalLight = evaluateBlackbodyPalette(max(0.75, fireIrr * 1.25), r.colorPalette)
                        * fireIrr * r.internalScattering * (0.45 + 0.55 * exp(-smoke * 0.9));

      let smokeScattering = r.smokeAlbedo * (directSunScatter + ambientScatter) + internalLight;
      let fireEmission = evaluateBlackbodyPalette(temp, r.colorPalette) * r.fireIntensity;

      let totalSource = smokeScattering * (smoke * r.densityExtinction) + fireEmission * (1.0 + react * 0.25);
      let stepIntegral = totalSource * ((1.0 - stepTrans) / extinction);

      accumLight += transmittance * stepIntegral;
      transmittance *= stepTrans;

      if (transmittance < 0.008) {
        transmittance = 0.0;
        break;
      }
    }
    t += baseStepSize;
  }

  var finalCol = accumLight + bgSky * transmittance;
  finalCol = acesToneMap(finalCol * r.exposure);
  return vec4<f32>(pow(finalCol, vec3<f32>(1.0 / 2.2)), 1.0);
}
`;class U{static async isAvailable(){if(typeof navigator>"u"||!navigator.gpu)return!1;try{return!!await navigator.gpu.requestAdapter()}catch{return!1}}static async create(i,t){if(!navigator.gpu)throw new Error("WebGPU is not supported in this browser.");const e=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});if(!e)throw new Error("No WebGPU adapter found.");const r=await e.requestDevice(),a=i.getContext("webgpu");if(!a)throw new Error("Could not acquire WebGPU canvas context.");const l=navigator.gpu.getPreferredCanvasFormat();a.configure({device:r,format:l,alphaMode:"opaque"}),r.pushErrorScope("validation");let n;try{n=new U(i,t,r,a,l);const u=await r.popErrorScope();if(u)throw new Error(u.message);return n}catch(u){throw r.destroy(),u}}constructor(i,t,e,r,a){this.canvas=i,this.params=t,this.device=e,this.context=r,this.format=a,this.backendName="WebGPU (WGSL Compute)",this.time=0,this.stepCount=0,this.pendingBlasts=[],this.simDurationMs=0,this.dynamicBoundsSurge=0,this.dynamicBoundsTarget=0,this.initPipelines(),this.initGridBuffers(t.gridResolution)}getBoundsBox(){const i=this.params,t=i.dynamicBoundsMax||1.55,e=i.dynamicBounds?1+this.dynamicBoundsSurge*(t-1):1,r=(i.boundsWidth||1.85)*e,a=(i.boundsHeight||2.1)*(1+(e-1)*1.15),l=-.6,n=[-.5*r,l,-.5*r],u=[.5*r,l+a,.5*r],h=[r,a/1.2,r];return{boxMin:n,boxMax:u,domainScale:h,effWidth:r,effHeight:a,surgeMult:e}}initPipelines(){const i=this.device,t=i.createShaderModule({code:Ee});this.computeBGL=i.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:4,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:5,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}}]});const e=i.createPipelineLayout({bindGroupLayouts:[this.computeBGL]}),r=l=>i.createComputePipeline({layout:e,compute:{module:t,entryPoint:l}});this.pipelines={splat:r("csSplat"),advect:r("csAdvect"),curl:r("csCurl"),forces:r("csForces"),divergence:r("csDivergence"),pressure:r("csPressure"),gradient:r("csGradient")};const a=i.createShaderModule({code:ke});this.renderBGL=i.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.FRAGMENT|GPUShaderStage.VERTEX,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:2,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:3,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}},{binding:4,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}}]}),this.renderPipeline=i.createRenderPipeline({layout:i.createPipelineLayout({bindGroupLayouts:[this.renderBGL]}),vertex:{module:a,entryPoint:"vsMain"},fragment:{module:a,entryPoint:"fsMain",targets:[{format:this.format}]},primitive:{topology:"triangle-list"}}),this.simUniformBuffer=i.createBuffer({size:176,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.renderUniformBuffer=i.createBuffer({size:208,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST})}initGridBuffers(i){const t=this.device;this.gridRes=Number(i)||64;const r=this.gridRes*this.gridRes*this.gridRes*16;this.buffers&&Object.values(this.buffers).forEach(u=>u&&u.destroy());const a=()=>t.createBuffer({size:r,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});this.buffers={vel0:a(),vel1:a(),thermo0:a(),thermo1:a(),curl:a(),div:a(),pres0:a(),pres1:a(),dummy:a()};const l=(u,h,m,s,f)=>t.createBindGroup({layout:this.computeBGL,entries:[{binding:0,resource:{buffer:this.simUniformBuffer}},{binding:1,resource:{buffer:u}},{binding:2,resource:{buffer:h}},{binding:3,resource:{buffer:m}},{binding:4,resource:{buffer:s}},{binding:5,resource:{buffer:f}}]}),n=this.buffers;this.bindGroups={splat:l(n.vel0,n.thermo0,n.dummy,n.vel1,n.thermo1),advect:l(n.vel1,n.thermo1,n.dummy,n.vel0,n.thermo0),curl:l(n.vel0,n.dummy,n.dummy,n.curl,n.dummy),forces:l(n.vel0,n.thermo0,n.curl,n.vel1,n.dummy),divergence:l(n.vel1,n.thermo0,n.dummy,n.div,n.dummy),pres0to1:l(n.vel1,n.pres0,n.div,n.pres1,n.dummy),pres1to0:l(n.vel1,n.pres1,n.div,n.pres0,n.dummy),gradient:l(n.vel1,n.pres0,n.dummy,n.vel0,n.dummy),render0:t.createBindGroup({layout:this.renderBGL,entries:[{binding:0,resource:{buffer:this.renderUniformBuffer}},{binding:1,resource:{buffer:n.thermo0}},{binding:2,resource:{buffer:n.vel0}},{binding:3,resource:{buffer:n.curl}},{binding:4,resource:{buffer:n.pres0}}]}),render1:t.createBindGroup({layout:this.renderBGL,entries:[{binding:0,resource:{buffer:this.renderUniformBuffer}},{binding:1,resource:{buffer:n.thermo1}},{binding:2,resource:{buffer:n.vel1}},{binding:3,resource:{buffer:n.curl}},{binding:4,resource:{buffer:n.pres0}}]})}}setGridResolution(i){Number(i)!==this.gridRes&&this.initGridBuffers(Number(i))}clearGrid(){const i=this.device.createCommandEncoder();Object.values(this.buffers).forEach(t=>{i.clearBuffer(t)}),this.device.queue.submit([i.finish()])}setBrush(i,t,e=!0){e&&i&&this.triggerExplosion({center:i,radius:.095,strength:4.5,temp:4.6,fuel:3.4,smoke:1.6,lobes:4})}spawnShrapnelBurst(i=[.5,.22,.5],t=6){for(let e=0;e<Math.min(4,t);e++){const r=e/t*Math.PI*2;setTimeout(()=>{this.triggerExplosion({center:[Math.max(.15,Math.min(.85,i[0]+Math.cos(r)*.22)),Math.min(.75,i[1]+.18),Math.max(.15,Math.min(.85,i[2]+Math.sin(r)*.22))],radius:.11,strength:5.5,temp:5,fuel:3.6,smoke:1.8,lobes:5})},e*60)}}triggerExplosion(i={}){const t=this.params;this.pendingBlasts.push({center:i.center||[.5,.18,.5],radius:i.radius??t.blastRadius,strength:i.strength??t.blastStrength,temp:i.temp??t.blastTemperature,fuel:i.fuel??t.blastFuel,smoke:i.smoke??t.blastSmoke,lobes:i.lobes??t.blastLobes,seed:Math.random()*100}),this.dynamicBoundsTarget=Math.min(1,this.dynamicBoundsTarget+.65)}stepSimulation(i){const t=performance.now(),e=this.params,r=Math.min(i,.033)*e.timeScale;if(this.time+=r,this.stepCount++,e.dynamicBounds){const b=this.dynamicBoundsTarget>this.dynamicBoundsSurge?2.8:.45;this.dynamicBoundsSurge+=(this.dynamicBoundsTarget-this.dynamicBoundsSurge)*Math.min(1,r*b),this.dynamicBoundsTarget=Math.max(0,this.dynamicBoundsTarget-r*.22)}else this.dynamicBoundsSurge=0,this.dynamicBoundsTarget=0;const a=this.pendingBlasts.shift(),l=new ArrayBuffer(176),n=new Uint32Array(l),u=new Float32Array(l);n[0]=this.gridRes,n[1]=e.macCormackAdvection?1:0,n[2]=e.enclosedBox?1:0,n[3]=e.emitterEnabled?1:0,u[4]=r,u[5]=this.time,u[6]=e.emitterRate,u[7]=e.emitterRadius,u[8]=e.emitterHeight,u[9]=e.emitterUpwardVelocity,u[10]=e.emitterSwirl,u[11]=e.emitterTemperature,u[12]=e.emitterFuel,u[13]=e.emitterSmoke,n[14]=a?1:0,n[15]=e.obstacleType,u[16]=a?a.center[0]:.5,u[17]=a?a.center[1]:.22,u[18]=a?a.center[2]:.5,u[19]=a?a.radius:e.blastRadius,u[20]=a?a.strength:e.blastStrength,u[21]=a?a.temp:e.blastTemperature,u[22]=a?a.fuel:e.blastFuel,u[23]=a?a.smoke:e.blastSmoke,u[24]=a?a.lobes:e.blastLobes,u[25]=a?a.seed:0,u[26]=e.burnRate,u[27]=e.burnHeat,u[28]=e.sootGeneration,u[29]=e.coolingRate,u[30]=e.smokeDissipation,u[31]=e.velocityDamping,u[32]=e.vorticityConfinement,u[33]=e.buoyancy,u[34]=e.smokeWeight,u[35]=e.combustionExpansion,u[36]=e.turbulenceStrength,u[37]=e.turbulenceScale,u[38]=e.windX,u[39]=e.windZ,u[40]=e.obstacleX,u[41]=e.obstacleY,u[42]=e.obstacleZ,u[43]=e.obstacleRadius,this.device.queue.writeBuffer(this.simUniformBuffer,0,l);const h=Math.ceil(this.gridRes/4),m=this.device.createCommandEncoder(),s=m.beginComputePass(),f=(b,x)=>{s.setPipeline(b),s.setBindGroup(0,x),s.dispatchWorkgroups(h,h,h)};f(this.pipelines.splat,this.bindGroups.splat),f(this.pipelines.advect,this.bindGroups.advect),f(this.pipelines.curl,this.bindGroups.curl),f(this.pipelines.forces,this.bindGroups.forces),f(this.pipelines.divergence,this.bindGroups.divergence);const v=Math.max(2,Math.round(e.pressureIterations/2));for(let b=0;b<v;b++)f(this.pipelines.pressure,this.bindGroups.pres0to1),f(this.pipelines.pressure,this.bindGroups.pres1to0);f(this.pipelines.gradient,this.bindGroups.gradient),s.end(),this.device.queue.submit([m.finish()]),this.simDurationMs=performance.now()-t}render(i){const t=this.params,e=t.sunAzimuth*Math.PI/180,r=t.sunElevation*Math.PI/180,a=Math.cos(r)*Math.sin(e),l=Math.sin(r),n=Math.cos(r)*Math.cos(e),u=Math.tan(i.fovY*.5),h=new ArrayBuffer(208),m=new Float32Array(h),s=new Uint32Array(h),{boxMin:f,boxMax:v}=this.getBoundsBox();m[0]=i.position[0],m[1]=i.position[1],m[2]=i.position[2],m[3]=u,m[4]=i.forward[0],m[5]=i.forward[1],m[6]=i.forward[2],m[7]=i.aspect,m[8]=i.right[0],m[9]=i.right[1],m[10]=i.right[2],m[11]=this.time,m[12]=i.up[0],m[13]=i.up[1],m[14]=i.up[2],s[15]=this.gridRes,m[16]=a,m[17]=l,m[18]=n,m[19]=t.voxelQuantization,s[20]=t.renderChannel,s[21]=t.colorPalette,s[22]=t.raymarchSteps,s[23]=t.shadowSteps,m[24]=t.densityExtinction,m[25]=t.smokeAlbedo,m[26]=t.shadowDensity,m[27]=t.fireIntensity,m[28]=t.temperatureScale,m[29]=t.internalScattering,m[30]=t.phaseAnisotropy,m[31]=t.ambientIntensity,m[32]=t.sunIntensity,m[33]=t.exposure,s[34]=t.sliceAxis,m[35]=t.slicePosition,s[36]=t.obstacleType,m[37]=t.obstacleX,m[38]=t.obstacleY,m[39]=t.obstacleZ,m[40]=t.obstacleRadius,s[41]=t.showBoundingBox?1:0,s[42]=t.showVoxelGridLines?1:0,s[43]=t.showFloorGrid?1:0,m[44]=f[0],m[45]=f[1],m[46]=f[2],m[47]=0,m[48]=v[0],m[49]=v[1],m[50]=v[2],m[51]=0,this.device.queue.writeBuffer(this.renderUniformBuffer,0,h);const b=this.device.createCommandEncoder(),x=this.context.getCurrentTexture().createView(),d=b.beginRenderPass({colorAttachments:[{view:x,clearValue:{r:.015,g:.018,b:.024,a:1},loadOp:"clear",storeOp:"store"}]});d.setPipeline(this.renderPipeline),d.setBindGroup(0,this.bindGroups.render0),d.draw(3),d.end(),this.device.queue.submit([b.finish()])}destroy(){this.buffers&&Object.values(this.buffers).forEach(i=>i&&i.destroy()),this.simUniformBuffer&&this.simUniformBuffer.destroy(),this.renderUniformBuffer&&this.renderUniformBuffer.destroy()}}const $={Eye:{theta:.72,phi:1.32,distance:3.05,center:[0,.18,0]},Low:{theta:2.3,phi:1.52,distance:2.45,center:[0,-.05,0]},High:{theta:-.95,phi:.92,distance:4.3,center:[0,.35,0]},Close:{theta:1.15,phi:1.28,distance:1.75,center:[0,.05,0]}},te=[{identity:"hero_detonation",name:"Hero detonation",covers:"The expensive case. Highest lattice, most pressure sweeps, dynamic bounds expanding mid-blast — this is the scene that proves the native budget governor assigns the Hero rung and holds it.",preset:"ue5_pyro_default",framing:"Eye",names:{domain:"Blast domain",emitter:"Charge",collider:"Ground plate",sun:"Key light"},params:{gridResolution:128,pressureIterations:26}},{identity:"camp_fire_steady",name:"Camp fire, steady",covers:"The cheap steady case. A continuous emitter with no blast at all, so the native port's emitter path is exercised without the detonation path masking a fault in it.",preset:"camp_fire",framing:"Close",names:{domain:"Fire domain",emitter:"Log fire",collider:"Stone ring",sun:"Moonlight"},params:{}},{identity:"cold_dust_fall",name:"Cold dust fall",covers:"No fuel and no heat anywhere. Everything visible arrives through scattering, so this is the scene that catches a native raymarch whose emission term is carrying the picture.",preset:"settling_dust",framing:"Low",names:{domain:"Dust domain",emitter:"Ledge spill",collider:"Rubble",sun:"Overcast key"},params:{}},{identity:"tyre_burnout_ring",name:"Tyre burnout",covers:"The only sample selecting the tyre ring obstacle, and the one that ties a gas domain to a vehicle. GasColliderShape::TyreRing and this scene have to agree or a burnout smokes through its own tyre.",preset:"tyre_burnout",framing:"Low",names:{domain:"Contact patch",emitter:"Slip",collider:"Rear tyre",sun:"Pit light"},params:{}},{identity:"deflector_obstacle",name:"Deflected plume",covers:"A plume driven into a slab. The one sample where obstruction changes the silhouette, so a native occupancy path that marks nothing still produces a picture — and a visibly wrong one.",preset:"obstacle_deflection",framing:"Eye",names:{domain:"Vent domain",emitter:"Floor vent",collider:"Deflector slab",sun:"Key light"},params:{}},{identity:"fracture_dust_burst",name:"Fracture dust burst",covers:"What a fracture piece actually spawns: a cold one-shot burst, no emitter, gone in under two seconds. The shortest-lived sample, and the one the flipbook bake in step 5 is aimed at.",preset:"brick_fracture_dust",framing:"Close",names:{domain:"Impact domain",emitter:"Break point",collider:"Masonry",sun:"Key light"},params:{}},{identity:"far_cheap_plume",name:"Distant plume",covers:"Deliberately the cheapest legal scene: lowest lattice, fewest sweeps. The native governor should place this on a low rung unprompted, and the port should still look like something at that cost.",preset:"low_gpu_performance",framing:"High",names:{domain:"Far domain",emitter:"Distant fire",collider:"None",sun:"Key light"},params:{gridResolution:32,pressureIterations:14}},{identity:"open_bounds_megaton",name:"Open bounds megaton",covers:"The largest domain in the corpus. Catches the optical normalisation: without it this scene renders nearly transparent in the native port while the browser shows a solid fireball.",preset:"megaton_open_bounds",framing:"High",names:{domain:"Open domain",emitter:"Device",collider:"Terrain",sun:"Key light"},params:{}}];function Re(c){const i=te.find(e=>e.identity===c);if(!i)throw new Error(`Unknown sample scene: ${c}`);const t=B[i.preset];if(!t)throw new Error(`Sample ${c} starts from a preset that no longer exists`);return{format:"frontier-fluid-scene",version:1,name:i.name,params:{...L,...t.params,...i.params},names:{...i.names},camera:{...$[i.framing],center:[...$[i.framing].center]}}}function Be(){return te.map(c=>({identity:c.identity,name:c.name,covers:c.covers,preset:c.preset,presetName:B[c.preset]?.name??""}))}const X="frontier-fluid-scene",j=1;function G(c){return String(c).replace(/\\/g,"\\\\").replace(/"/g,'\\"').replace(/\n/g,"\\n").replace(/\r/g,"\\r").replace(/\t/g,"\\t")}function M(c,i){if(!Number.isFinite(c))throw new Error(`Cannot write a non-finite number: ${c}`);return!i&&Number.isInteger(c)?String(c):Number.isInteger(c)?`${c}.0`:String(c)}const Pe=new Set(["gridResolution","pressureIterations","blastLobes","raymarchSteps","shadowSteps","emberCount","sliceAxis","obstacleType","renderChannel","colorPalette","voxelQuantization","atlasMinimapField"]);function De(c,i){if(typeof i=="boolean")return i?"true":"false";if(typeof i=="string")return`"${G(i)}"`;if(typeof i=="number")return M(i,!Pe.has(c));throw new Error(`Setting ${c} has a type TOML cannot carry: ${typeof i}`)}function Fe(c){if(!c||c.format!==X||c.version!==j)throw new Error("Not a supported Fluid scene (version 1).");const i=[];i.push("# Frontier gas scene. Written by Experimental/Fluid; read by Engine/VolumetricDynamics."),i.push("# Settings are sorted by name so the file diffs cleanly; order carries no meaning."),i.push(""),i.push(`format = "${X}"`),i.push(`version = ${j}`),i.push(`name = "${G(c.name)}"`),i.push(""),i.push("[names]");for(const t of Object.keys(c.names??{}).sort())i.push(`${t} = "${G(c.names[t])}"`);if(i.push(""),c.camera){const t=c.camera;i.push("[camera]"),i.push(`theta = ${M(t.theta,!0)}`),i.push(`phi = ${M(t.phi,!0)}`),i.push(`distance = ${M(t.distance,!0)}`),i.push(`centre = [${t.center.map(e=>M(e,!0)).join(", ")}]`),i.push("")}i.push("[settings]");for(const t of Object.keys(c.params).sort())i.push(`${t} = ${De(t,c.params[t])}`);return i.push(""),i.join(`
`)}const Y=".gasscene.toml",o=c=>document.querySelector(c),E=c=>[...document.querySelectorAll(c)],D=c=>String(c).replace(/[&<>"']/g,i=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[i]),q={flame:'<path d="M13 2c2 6-5 6-2 11-3-1-3-4-3-4C0 18 10 25 17 20c5-4 2-11-4-18Z"/>',smoke:'<path d="M6 20h12M5 15c-4-5 2-7 4-5-3-8 8-9 7-3 7-1 7 8 2 8H5Zm4 1v4m6-4v4"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1.5 1-1.5 1.5-1.5 3m0 3h.01"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',file:'<path d="M14 2H5v20h14V7Zm0 0v6h5M8 13h8m-8 4h6"/>',folder:'<path d="M3 6h7l2 3h9l-2 11H3V6Zm0 3h18"/>',plus:'<path d="M12 5v14M5 12h14"/>',layers:'<path d="m12 3 10 5-10 5L2 8Zm-9 10 9 5 9-5M3 17l9 5 9-5"/>',box:'<path d="m12 2 9 5v10l-9 5-9-5V7Zm0 10L3 7m9 5 9-5m-9 5v10M7 4.5 17 10"/>',link:'<path d="m10 14 4-4m-6 2-2 2a3.5 3.5 0 0 0 5 5l2-2m-2-10 2-2a3.5 3.5 0 0 1 5 5l-2 2"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',viewport:'<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 22h8m-4-4v4"/>',focus:'<path d="M3 8V3h5m8 0h5v5m0 8v5h-5M8 21H3v-5"/><circle cx="12" cy="12" r="3"/>',maximize:'<path d="M8 3H3v5m0-5 7 7m6 11h5v-5m0 5-7-7M16 3h5v5m0-5-7 7M8 21H3v-5m0 5 7-7"/>',orbit:'<circle cx="12" cy="12" r="4"/><ellipse cx="12" cy="12" rx="10" ry="6" transform="rotate(-35 12 12)"/>',brush:'<path d="m14 3 7 7-10 10H4v-7Zm-6 7 7 7M3 21h7"/>',burst:'<path d="m12 2 2 6 6-4-3 7 5 3-7 1-1 7-4-6-7 4 4-7-5-4 7 1Z"/>',rotate:'<path d="M4 10a8 8 0 1 1 1 7M4 3v7h7"/>',warning:'<path d="m12 3 10 18H2Zm0 6v5m0 3h.01"/>',rewind:'<path d="M4 5v14m14-14L7 12l11 7Z"/>',pause:'<path d="M8 5v14m8-14v14"/>',play:'<path d="m7 4 13 8-13 8Z"/>',step:'<path d="m4 5 11 7-11 7Zm15 0v14"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',sphere:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',wall:'<path d="M3 6h18v14H3Zm0 7h18M9 6v7m6 0v7"/>',cylinder:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',eye:'<path d="M2 12c5-9 15-9 20 0-5 9-15 9-20 0Z"/><circle cx="12" cy="12" r="3"/>',hidden:'<path d="m3 3 18 18M9 5c5-2 10 1 13 7l-4 5M6 6l-4 6c3 6 8 9 14 6"/>'},P=c=>`<svg viewBox="0 0 24 24" aria-hidden="true">${q[c]||q.box}</svg>`,Me=()=>E("[data-icon]").forEach(c=>{c.innerHTML=P(c.dataset.icon)}),Z=(c,i=.01)=>Number(c).toFixed(Number.isInteger(i)?0:i<.01?3:2);class Ve{constructor(){this.Parameters={...V},new URLSearchParams(location.search).get("quality")==="low"&&Object.assign(this.Parameters,{gridResolution:24,raymarchSteps:40,pressureIterations:10,renderScale:.5,shadowSteps:3,emberCount:100}),this.Camera=new z,this.Camera.targetDistance=4.1,this.Camera.targetCenter=[0,.3,0],this.Engine=null,this.Canvas=o("#pyro-canvas"),this.Names={domain:"Gas domain",emitter:"Fire emitter",collider:"Sphere collider",sun:"Directional light"},this.Selection="emitter",this.Tab="source",this.Preset="",this.Filter="all",this.SceneFilter="all",this.Dirty=!1,this.LastTime=performance.now(),this.Frames=0,this.Elapsed=0,this.FramesPerSecond=0,this.SingleStep=!1,this.Switching=!1,this.Bursts=[],this.SavedCollider=1,this.SavedSun=this.Parameters.sunIntensity,this.VisibleKeys=[],Me(),this.Documents=new ie(this,P),this.Flipbook=new we(this),this.ConnectInterface(),this.ConstructPresetCards(),this.ConstructSceneRows(),this.ConstructInspector(),this.RefreshControls(),new ResizeObserver(()=>this.ResizeViewport()).observe(o("#viewport")),this.InitializeRenderer("webgl2"),requestAnimationFrame(i=>this.Frame(i))}InitializeDocumentState(){this.Parameters={...V},new URLSearchParams(location.search).get("quality")==="low"&&Object.assign(this.Parameters,{gridResolution:24,raymarchSteps:40,pressureIterations:10,renderScale:.5,shadowSteps:3,emberCount:100}),this.Camera=new z,this.Camera.targetDistance=4.1,this.Camera.targetCenter=[0,.3,0],this.Names={domain:"Gas domain",emitter:"Fire emitter",collider:"Sphere collider",sun:"Directional light"},this.Selection="emitter",this.Tab="source",this.Preset="",this.Dirty=!1,this.Bursts=[],this.SavedCollider=1,this.SavedSun=this.Parameters.sunIntensity}RenderBounds(){const i=o("#domain-bounds"),t=this.Parameters.showBoundingBox&&!!this.Engine;if(i.toggleAttribute("hidden",!t),!t)return;const e=o("#viewport").getBoundingClientRect();i.setAttribute("viewBox",`0 0 ${e.width} ${e.height}`);const r=Te(this.Camera,this.Engine.getBoundsBox(),e.width,e.height);i.innerHTML=r.map(a=>`<line x1="${a[0].toFixed(2)}" y1="${a[1].toFixed(2)}" x2="${a[2].toFixed(2)}" y2="${a[3].toFixed(2)}"/>`).join("")}async InitializeRenderer(i){if(this.Switching)return;this.Switching=!0,this.Bursts=[],o("#backend-select").disabled=!0,o("#gpu-error").hidden=!0,o("#status-ready").textContent="Initializing GPU",this.Engine?.destroy(),this.Engine=null;const t=this.Canvas;this.Canvas=t.cloneNode(!1),t.replaceWith(this.Canvas),this.ConnectViewport();try{if(i==="webgpu")try{this.Engine=await U.create(this.Canvas,this.Parameters)}catch(e){this.Notify(`WebGPU unavailable. Using WebGL2. ${e.message}`);const r=this.Canvas;this.Canvas=r.cloneNode(!1),r.replaceWith(this.Canvas),this.ConnectViewport(),i="webgl2"}if(i==="webgl2"&&(this.Engine=new Q(this.Canvas,this.Parameters)),this.Engine.gl&&!this.Engine.extColorBufferFloat)throw new Error("This device needs EXT_color_buffer_float to run the voxel solver.");if(this.Engine.setGridResolution(this.Parameters.gridResolution),this.Backend=i,o("#backend-select").value=i,o("#viewport-subtitle").textContent=i==="webgpu"?"Experimental gas path · WebGL2 provides full effects":"Eulerian volume · physically shaded",this.ResizeViewport(),o("#status-ready").innerHTML="<i></i>GPU ready",i==="webgpu"){this.Notify("Experimental WebGPU: the upstream renderer has fewer visual features than WebGL2.");const e=this.Engine;e.device.lost.then(r=>{const a=r.message||"WebGPU device lost.";if(this.Engine===e)this.ShowGpuError(a);else{const l=this.Documents?.Slots.find(n=>n.State?.Engine===e);l&&(l.State.Fault=a)}})}}catch(e){this.Engine?.destroy(),this.Engine=null,this.ShowGpuError(e.message)}finally{this.Switching=!1,o("#backend-select").disabled=!1,this.RefreshControls()}}ShowGpuError(i){o("#gpu-error-message").textContent=i,o("#gpu-error").hidden=!1,o("#status-ready").textContent="GPU unavailable",this.Parameters.paused=!0,this.RefreshControls()}ResizeViewport(){const i=o("#viewport").getBoundingClientRect(),t=Math.min(devicePixelRatio||1,1.5)*this.Parameters.renderScale,e=Math.max(2,Math.floor(i.width*t)),r=Math.max(2,Math.floor(i.height*t));(this.Canvas.width!==e||this.Canvas.height!==r)&&(this.Canvas.width=e,this.Canvas.height=r),this.Camera.aspect=e/r}MarkDirty(){this.Dirty=!0,o("#dirty-indicator").classList.remove("clean"),this.Documents?.RefreshLabels()}Notify(i){clearTimeout(this.ToastTimeout),o("#toast").textContent=i,o("#toast").hidden=!1,this.ToastTimeout=setTimeout(()=>{o("#toast").hidden=!0},4500)}ApplyParameter(i,t){try{t=ee(i,t)}catch(r){this.Notify(r.message),this.RefreshControls();return}if(this.Parameters[i]===t)return;const e=this.Parameters[i];this.Parameters[i]=t;try{i==="gridResolution"&&(this.Engine?.setGridResolution(t),this.Restart(),this.Notify(`Grid rebuilt at ${t}³. Simulation restarted.`)),i==="renderScale"&&this.ResizeViewport(),i==="interactionMode"&&this.Engine?.setBrush(null,null,!1)}catch(r){this.Parameters[i]=e,this.ShowGpuError(r.message)}this.MarkDirty(),["emitterEnabled","obstacleType","sunIntensity"].includes(i)&&this.ConstructSceneRows(),this.RefreshControls()}RefreshControls(){E("[data-param]").forEach(e=>{const r=this.Parameters[e.dataset.param];if(e.type==="checkbox"?e.checked=r:e.type==="number"?e.value=Z(r,A[e.dataset.param]?.step):e.value=r,e.type==="range"){const a=Math.max(0,Math.min(1,(r-Number(e.min))/(Number(e.max)-Number(e.min))));e.style.setProperty("--fraction",a)}}),o("#render-channel").value=this.Parameters.renderChannel,o("#diagnostic-channel").value=this.Parameters.renderChannel,o("#atlas-toggle").checked=this.Parameters.showAtlasMinimap,o("#overlays-button").classList.toggle("active",this.Parameters.showBoundingBox),o("#turntable-button").classList.toggle("active",this.Parameters.autoTurntable),E("[data-tool]").forEach(e=>{e.classList.toggle("active",e.dataset.tool===this.Parameters.interactionMode),e.setAttribute("aria-pressed",String(e.dataset.tool===this.Parameters.interactionMode))}),o("#play-button").innerHTML=P(this.Parameters.paused?"play":"pause"),o("#play-button").setAttribute("aria-label",this.Parameters.paused?"Play simulation":"Pause simulation"),o("#live-pill span").textContent=this.Engine?this.Parameters.paused?"PAUSED":"LIVE":"OFFLINE",o("#live-pill").classList.toggle("paused",this.Parameters.paused);const i=o("#speed-select");i.querySelector("[data-custom]")?.remove(),[.25,.5,1,2].includes(this.Parameters.timeScale)||i.insertAdjacentHTML("beforeend",`<option data-custom value="${this.Parameters.timeScale}">${this.Parameters.timeScale.toFixed(2)}×</option>`),i.value=this.Parameters.timeScale,o("#grid-hud").textContent=`${this.Parameters.gridResolution}³ GRID`,o("#voxel-count").textContent=`${(this.Parameters.gridResolution**3).toLocaleString()} voxels`,o("#source-track-label").textContent=this.Parameters.emitterEnabled?"Continuous emission":"Burst-only simulation";const t=o("#object-enabled");t.disabled=this.Selection==="domain",t.checked=this.Selection==="emitter"?this.Parameters.emitterEnabled:this.Selection==="collider"?this.Parameters.obstacleType>0:this.Selection==="sun"?this.Parameters.sunIntensity>0:!0,o("#dirty-indicator").classList.toggle("clean",!this.Dirty),this.Documents?.RefreshLabels()}ConstructSceneRows(){const i=[["domain","box","VOLUME",!0],["emitter",this.Parameters.emitterFuel===0?"smoke":"flame","",this.Parameters.emitterEnabled],...this.Parameters.obstacleType>0||this.Selection==="collider"?[["collider","sphere","",this.Parameters.obstacleType>0]]:[],["sun","sun","",this.Parameters.sunIntensity>0]];o("#scene-count").textContent=i.length,o("#enabled-count").textContent=i.filter(n=>n[3]).length,o("#disabled-count").textContent=i.filter(n=>!n[3]).length;const t={domain:"gas",emitter:"gas",collider:"geometry",sun:"light"},e=o("#scene-search").value.toLowerCase().trim(),r=i.filter(([n])=>(this.SceneFilter==="all"||t[n]===this.SceneFilter)&&this.Names[n].toLowerCase().includes(e));o("#scene-tree").hidden=e?!1:o("#collection-toggle").getAttribute("aria-expanded")==="false";const a=r.map(([n,u,h,m])=>`<div class="scene-row ${this.Selection===n?"selected":""} ${m?"":"muted"}" data-object="${n}" data-category="${t[n]}" role="treeitem" aria-selected="${this.Selection===n}" aria-level="1" tabindex="0"><span class="row-chevron"></span><span class="row-icon">${P(u)}</span><span class="scene-label">${D(this.Names[n])}</span>${h?`<span class="row-badge">${h}</span>`:`<button class="icon-button row-toggle" data-toggle-object="${n}" title="${m?"Disable":"Enable"} ${D(this.Names[n])}" aria-label="${m?"Disable":"Enable"} ${D(this.Names[n])}">${P(m?"eye":"hidden")}</button>`}</div>`).join("")||'<div class="outliner-empty" role="status">No matching objects.</div>',l=JSON.stringify(r.map(n=>[...n,this.Names[n[0]]]));this.SceneRowSignature!==l?(o("#scene-tree").innerHTML=a,this.SceneRowSignature=l):E("#scene-tree [data-object]").forEach(n=>{const u=n.dataset.object===this.Selection;n.classList.toggle("selected",u),n.setAttribute("aria-selected",String(u))}),E("[data-scene-filter]").forEach(n=>{const u=n.dataset.sceneFilter===this.SceneFilter;n.classList.toggle("active",u),n.setAttribute("aria-pressed",String(u))})}SelectObject(i){this.Selection=i,this.Tab=i==="domain"?"simulation":i==="sun"?"rendering":"source",this.ConstructSceneRows(),this.ConstructInspector(),this.RefreshControls()}ToggleObject(i){i==="emitter"&&this.ApplyParameter("emitterEnabled",!this.Parameters.emitterEnabled),i==="collider"&&(this.Parameters.obstacleType?(this.SavedCollider=this.Parameters.obstacleType,this.ApplyParameter("obstacleType",0)):this.ApplyParameter("obstacleType",this.SavedCollider)),i==="sun"&&(this.Parameters.sunIntensity?(this.SavedSun=this.Parameters.sunIntensity,this.ApplyParameter("sunIntensity",0)):this.ApplyParameter("sunIntensity",this.SavedSun||2.2))}ConstructPresetCards(){const i=o("#preset-search").value.toLowerCase().trim(),t=Object.keys(F).filter(e=>{const r=F[e];return(this.Filter==="all"||r[1]===this.Filter)&&`${r.join(" ")} ${B[e].description}`.toLowerCase().includes(i)});o("#preset-count").textContent=Object.keys(B).length,o("#presets-list").innerHTML=t.map(e=>{const[r,a,l,n]=F[e];return`<button class="preset-card ${this.Preset===e?"active":""}" data-preset="${e}" data-category="${a}" title="${D(B[e].description)}" aria-label="Load ${r}"><span class="preset-swatch">${P(n)}</span><span class="preset-copy"><strong>${r}</strong><small>${l}</small></span><span class="preset-arrow">↗</span></button>`}).join(""),o("#empty-presets").hidden=t.length>0,E("[data-filter]").forEach(e=>e.classList.toggle("active",e.dataset.filter===this.Filter))}LoadPreset(i){this.ApplySceneParameters(xe(i)),this.Preset=i,this.Names.emitter=this.Parameters.emitterFuel===0?"Smoke emitter":"Fire emitter",this.Names.collider=ae.find(t=>t.id===(this.Parameters.obstacleType||1))?.label+" collider",o("#document-name").value=F[i][0],this.Selection=this.Parameters.emitterEnabled?"emitter":"domain",this.Tab=this.Parameters.emitterEnabled?"source":"simulation",this.Camera.reset(),this.Camera.targetDistance=Math.min(9.5,Math.max(this.Parameters.boundsWidth,this.Parameters.boundsHeight)*2.3),B[i].triggerExplosionOnLoad&&this.Engine?.triggerExplosion(),this.ConstructPresetCards(),this.ConstructSceneRows(),this.ConstructInspector(),this.RefreshControls(),this.Notify(`${F[i][0]} loaded · ${this.Parameters.gridResolution}³ grid`)}ApplySceneParameters(i){const t=this.Parameters.gridResolution;Object.assign(this.Parameters,i);try{t!==this.Parameters.gridResolution&&this.Engine?.setGridResolution(this.Parameters.gridResolution),this.Restart(),this.ResizeViewport()}catch(e){this.ShowGpuError(e.message)}this.MarkDirty()}RenderControl(i){const t=A[i],e=D(ge[i]||t.label),r=this.Parameters[i];if(this.VisibleKeys.push(i),t.type==="toggle")return`<div class="property-row toggle-row"><label class="property-label" for="property-${i}">${e}</label><label class="switch"><input id="property-${i}" type="checkbox" data-param="${i}" ${r?"checked":""}/><span></span></label></div>`;if(t.type==="select")return`<div class="property-row select-row"><label class="property-label" for="property-${i}">${e}</label><select id="property-${i}" data-param="${i}">${t.options.map(l=>`<option value="${l.id??l.value}" ${(l.id??l.value)===r?"selected":""}>${D(l.label)}</option>`).join("")}</select></div>`;const a={boundsWidth:"m",boundsHeight:"m",emitterRadius:"m",emitterHeight:"m",obstacleRadius:"m",sunElevation:"°",sunAzimuth:"°",timeScale:"×",renderScale:"×",dynamicBoundsMax:"×",emitterRate:"×",temperatureScale:"×",emberLifetime:"×"}[i]||"—";return`<div class="property-row slider-row"><label class="property-label" for="property-${i}">${e}</label><div class="slider-control"><div class="value-pill"><input id="property-${i}" data-param="${i}" type="number" value="${Z(r,t.step)}" min="${t.min}" max="${t.max}" step="${t.step}"/><span class="unit-cell" aria-hidden="true">${a}</span></div><input type="range" aria-label="${e} slider" data-param="${i}" min="${t.min}" max="${t.max}" step="${t.step}" value="${r}"/></div></div>`}ConstructInspector(){this.VisibleKeys=[];const i=this.Selection;o("#object-name").value=this.Names[i],o("#object-type").textContent={domain:"EULERIAN VOLUME",emitter:"CONTINUOUS SOURCE",collider:"SIGNED DISTANCE COLLIDER",sun:"DIRECTIONAL LIGHT"}[i],o("#object-symbol").innerHTML=P({domain:"box",emitter:"flame",collider:"sphere",sun:"sun"}[i]),o("#viewport-object").textContent=this.Names[i],E("[data-tab]").forEach(r=>r.classList.toggle("active",this.Tab===r.dataset.tab));const t=[],e=(r,a,l="",n=!0,u="")=>t.push(`<details class="property-group" ${n?"open":""}><summary>${r}<span class="section-badge">${l}</span></summary><div class="group-content">${u?`<p class="property-hint">${u}</p>`:""}${a.map(h=>this.RenderControl(h)).join("")}</div></details>`);this.Tab==="source"&&(i==="collider"?e("Collider",["obstacleType","obstacleX","obstacleY","obstacleZ","obstacleRadius","colliderAutoMove","colliderSpeed"],"SDF",!0,"Position is normalized within the domain. The collider changes the simulated flow without restarting it."):(e("Emission",["emitterEnabled","emitterRate","emitterRadius","emitterHeight"],"SOURCE",!0,"A continuous source at the domain’s X/Z centre. Height and radius are live simulation parameters."),e("Fuel & temperature",["emitterTemperature","emitterFuel","emitterSmoke"],"INJECTION"),e("Velocity",["emitterUpwardVelocity","emitterSwirl"],"FLOW")),e("Burst generator",["shrapnelEnabled","blastStrength","blastRadius","blastTemperature","blastFuel","blastSmoke","blastLobes"],"IMPULSE",!1),i!=="collider"&&e("Collider",["obstacleType","obstacleX","obstacleY","obstacleZ","obstacleRadius","colliderAutoMove","colliderSpeed"],"SDF",!1)),this.Tab==="simulation"&&(e("Domain",["boundsWidth","boundsHeight","dynamicBounds","dynamicBoundsMax"],"3D"),e("Voxel grid",["gridResolution","pressureIterations","macCormackAdvection","enclosedBox","timeScale"],"SOLVER",!0,"Changing voxel resolution rebuilds the grid and restarts the simulation. Other properties update live."),e("Forces & turbulence",["vorticityConfinement","buoyancy","smokeWeight","turbulenceStrength","turbulenceScale","windX","windZ","velocityDamping"],"FLOW",!1),e("Combustion",["burnRate","burnHeat","sootGeneration","combustionExpansion","coolingRate","smokeDissipation"],"THERMAL",!1)),this.Tab==="rendering"&&(i==="sun"&&e("Directional light",["sunIntensity","sunAzimuth","sunElevation","ambientIntensity"],"LIGHT"),e("Volume shading",["colorPalette","fireIntensity","densityExtinction","smokeAlbedo","exposure"],"VOLUME"),i!=="sun"&&e("Directional light",["sunIntensity","sunAzimuth","sunElevation","ambientIntensity"],"LIGHT",!1),e("Scattering & glow",["bloomIntensity","godRaysIntensity","shockwaveStrength","temperatureScale","internalScattering","shadowDensity","phaseAnisotropy"],"OPTICS",!1),e("Render quality",["raymarchSteps","shadowSteps","renderScale","autoGpuGovernor","voxelQuantization"],"GPU",!1),e("Embers & ash",["showEmbers","emberCount","emberSize","emberIntensity","emberLifetime","emberAshiness"],"PARTICLES",!1),e("Overlays & diagnostics",["showBoundingBox","showVoxelGridLines","showFloorGrid","showActiveVoxelCells","showAtlasMinimap","atlasMinimapField","renderChannel","sliceAxis","slicePosition"],"DEBUG",!1)),this.Tab==="source"&&["emitter","collider"].includes(i)&&t.push(`<button class="remove-object" id="remove-object">${i==="emitter"?"Disable source":"Remove collider"}</button>`),o("#inspector-body").innerHTML=t.join(""),o("#inspector-body").scrollTop=0,this.RefreshControls()}AddObject(i){o("#add-menu").hidden=!0,o("#add-button").setAttribute("aria-expanded","false"),["fire","smoke"].includes(i)?(Object.assign(this.Parameters,{emitterEnabled:!0,emitterFuel:i==="fire"?2.8:0,emitterTemperature:i==="fire"?3.5:.8,emitterSmoke:i==="fire"?1.4:2.5}),this.Names.emitter=i==="fire"?"Fire emitter":"Smoke emitter",this.SelectObject("emitter")):(this.Parameters.obstacleType={sphere:1,cylinder:2,slab:4}[i],this.Parameters.obstacleY=.35,this.Parameters.colliderAutoMove=!1,this.Names.collider={sphere:"Sphere collider",cylinder:"Cylinder collider",slab:"Deflector slab"}[i],this.SelectObject("collider")),this.MarkDirty(),this.Notify("Scene slot updated. Existing simulation preserved.")}Restart(){this.Bursts=[],this.Engine&&(this.Engine.clearGrid(),this.Engine.pendingBlasts=[],this.Engine.time=0,this.Engine.stepCount=0,this.Engine.dynamicBoundsSurge=0,this.Engine.dynamicBoundsTarget=0,this.Engine.setBrush(null,null,!1)),this.SingleStep=!1}TriggerBurst(i=o("#burst-kind").value,t=null){if(!this.Engine)return this.Notify("The GPU renderer must be available to create a burst.");this.Parameters.paused&&this.Notify("Burst queued. Press Space or step once to simulate.");const e=(r,a)=>this.Bursts.push({Time:this.Engine.time+r,Options:a});if(t){e(0,{center:t});return}i==="salvo"?[[.32,.16,.34],[.68,.18,.33],[.33,.2,.67],[.66,.22,.66]].forEach((r,a)=>e(a*.17,{center:r,radius:this.Parameters.blastRadius*.85,strength:this.Parameters.blastStrength*.95,temp:this.Parameters.blastTemperature*1.05,smoke:this.Parameters.blastSmoke*1.1,lobes:7})):i==="collide"?[-1,1].forEach((r,a)=>e(a*.03,{center:[r<0?.22:.78,.3,.5],radius:.16,strength:7.5,temp:6.2,fuel:4.8,smoke:2.5,lobes:6,directionalVel:[-r*14,1.5,0]})):i==="mushroom"?(this.Restart(),e(0,{center:[.5,.14,.5],radius:.23,strength:12.5,temp:6.5,fuel:5.5,smoke:3.2,lobes:8}),e(.15,{center:[.5,.29,.5],radius:.19,strength:9.5,temp:6.8,fuel:4.8,smoke:2.4,lobes:6})):e(0,{spawnShrapnel:i==="shrapnel"||this.Parameters.shrapnelEnabled})}SaveScene(){const i={format:"frontier-fluid-scene",version:1,sourceRevision:J,name:o("#document-name").value.trim()||"Untitled scene",params:{...this.Parameters},names:{...this.Names},camera:{theta:this.Camera.targetTheta,phi:this.Camera.targetPhi,distance:this.Camera.targetDistance,center:[...this.Camera.targetCenter]}},t=URL.createObjectURL(new Blob([JSON.stringify(i,null,2)],{type:"application/json"})),e=document.createElement("a");e.href=t,e.download=`${i.name.replace(/[^a-z0-9 _-]/gi,"").trim()||"scene"}.fluid.json`,e.click(),setTimeout(()=>URL.revokeObjectURL(t),1e3),this.Dirty=!1,this.RefreshControls(),this.Notify("Scene settings saved. Live voxel fields are not cached.")}LoadSample(i){if(i)try{const t=H(Re(i));this.ApplySceneParameters(t.Parameters),this.Names=t.Names,o("#document-name").value=t.Name,t.Camera&&(this.Camera.targetTheta=t.Camera.theta,this.Camera.targetPhi=t.Camera.phi,this.Camera.targetDistance=t.Camera.distance,this.Camera.targetCenter=t.Camera.center),this.Preset="",this.Selection="domain",this.Dirty=!1,this.ConstructPresetCards(),this.ConstructSceneRows(),this.ConstructInspector(),this.RefreshControls(),this.Notify(`Loaded sample: ${t.Name}`)}catch(t){this.Notify(`Could not load that sample: ${t.message}`)}}SaveSceneToml(){const i=o("#document-name").value.trim()||"Untitled scene",t={format:"frontier-fluid-scene",version:1,name:i,params:{...this.Parameters},names:{...this.Names},camera:{theta:this.Camera.targetTheta,phi:this.Camera.targetPhi,distance:this.Camera.targetDistance,center:[...this.Camera.targetCenter]}},e=URL.createObjectURL(new Blob([Fe(t)],{type:"text/plain"})),r=document.createElement("a");r.href=e,r.download=`${i.replace(/[^a-z0-9 _-]/gi,"").trim()||"scene"}${Y}`,r.click(),setTimeout(()=>URL.revokeObjectURL(e),1e3),this.Notify(`Saved ${Y} — this is the file the engine reads.`)}async OpenScene(i){if(!i)return;const t=this.Documents.ActiveIdentity;try{if(i.size>256*1024)throw new Error("Scene settings must be smaller than 256 KB.");const e=H(JSON.parse(await i.text()));if(t!==this.Documents.ActiveIdentity||this.Baking||this.Switching)throw new Error("The active document changed or is busy. Select the intended tab and open the scene again.");this.ApplySceneParameters(e.Parameters),this.Names=e.Names,o("#document-name").value=e.Name,e.Camera&&(this.Camera.targetTheta=e.Camera.theta,this.Camera.targetPhi=e.Camera.phi,this.Camera.targetDistance=e.Camera.distance,this.Camera.targetCenter=e.Camera.center),this.Preset="",this.Selection="domain",this.Tab="simulation",this.Dirty=!1,this.ConstructPresetCards(),this.ConstructSceneRows(),this.ConstructInspector(),this.RefreshControls(),this.Notify("Scene settings opened. Simulation restarted from an empty grid.")}catch(e){this.Notify(`Scene not opened: ${e.message}`)}finally{o("#import-file").value=""}}ConnectInterface(){["#render-channel","#diagnostic-channel"].forEach(e=>{o(e).innerHTML=re.map(r=>`<option value="${r.id}">${r.label}</option>`).join(""),o(e).addEventListener("change",r=>this.ApplyParameter("renderChannel",Number(r.target.value)))}),o("#scene-tree").addEventListener("click",e=>{const r=e.target.closest("[data-toggle-object]");if(r)return this.ToggleObject(r.dataset.toggleObject);const a=e.target.closest("[data-object]");a&&this.SelectObject(a.dataset.object)}),o("#scene-search").addEventListener("input",()=>this.ConstructSceneRows()),o("#scene-filters").addEventListener("click",e=>{const r=e.target.closest("[data-scene-filter]");r&&(this.SceneFilter=r.dataset.sceneFilter,this.ConstructSceneRows())}),o("#compact-outliner").addEventListener("click",()=>{const e=o(".left-panel").classList.toggle("compact-outliner");o("#compact-outliner").setAttribute("aria-pressed",String(e))}),o("#collection-toggle").addEventListener("click",()=>{const e=o("#collection-toggle").getAttribute("aria-expanded")==="true";o("#collection-toggle").setAttribute("aria-expanded",String(!e)),o("#scene-tree").hidden=e}),o("#scene-tree").addEventListener("keydown",e=>{if(!e.target.matches("[data-object]"))return;e.key==="Enter"&&this.SelectObject(e.target.dataset.object);const r=E("#scene-tree [data-object]"),a=r.indexOf(e.target);(e.key==="ArrowDown"||e.key==="ArrowUp")&&(e.preventDefault(),r[Math.max(0,Math.min(r.length-1,a+(e.key==="ArrowDown"?1:-1)))].focus())}),o("#scene-tree").addEventListener("dblclick",e=>{e.target.closest("[data-object]")&&(o("#object-name").focus(),o("#object-name").select())}),o("#object-name").addEventListener("change",e=>{this.Names[this.Selection]=e.target.value.trim()||this.Names[this.Selection],e.target.value=this.Names[this.Selection],this.ConstructSceneRows(),o("#viewport-object").textContent=this.Names[this.Selection],this.MarkDirty()}),o("#document-name").addEventListener("input",()=>this.MarkDirty()),o("#object-enabled").addEventListener("change",()=>this.ToggleObject(this.Selection)),o("#presets-list").addEventListener("click",e=>{const r=e.target.closest("[data-preset]");r&&this.LoadPreset(r.dataset.preset)}),o("#preset-search").addEventListener("input",()=>this.ConstructPresetCards()),o("#reset-search").addEventListener("click",()=>{o("#preset-search").value="",this.Filter="all",this.ConstructPresetCards()}),o("#preset-filters").addEventListener("click",e=>{e.target.dataset.filter&&(this.Filter=e.target.dataset.filter,this.ConstructPresetCards())}),o("#inspector-tabs").addEventListener("click",e=>{e.target.dataset.tab&&(this.Tab=e.target.dataset.tab,this.ConstructInspector())});let i=null;o("#inspector-body").addEventListener("pointerdown",e=>{!e.target.matches(".value-pill input[type=number]")||e.button!==0||(i={Element:e.target,Pointer:e.pointerId,X:e.clientX,Value:Number(e.target.value),Moved:!1},e.target.setPointerCapture(e.pointerId))}),o("#inspector-body").addEventListener("pointermove",e=>{if(!i||i.Pointer!==e.pointerId)return;const r=e.clientX-i.X;if(!i.Moved&&Math.abs(r)<3)return;e.preventDefault(),i.Moved=!0,i.Element.classList.add("scrubbing");const a=A[i.Element.dataset.param],l=e.shiftKey?.1:e.altKey?10:1,n=Math.round((i.Value+r*a.step*l)/a.step)*a.step;this.ApplyParameter(a.key,Number(Math.max(a.min,Math.min(a.max,n)).toFixed(6)))});for(const e of["pointerup","pointercancel","lostpointercapture"])o("#inspector-body").addEventListener(e,()=>{i&&i.Element.classList.remove("scrubbing"),i=null});o("#inspector-body").addEventListener("input",e=>{e.target.type==="range"&&this.ApplyParameter(e.target.dataset.param,Number(e.target.value))}),o("#inspector-body").addEventListener("change",e=>{const r=e.target;r.dataset.param&&this.ApplyParameter(r.dataset.param,r.type==="checkbox"?r.checked:Number(r.value))}),o("#inspector-body").addEventListener("click",e=>{e.target.id==="remove-object"&&(this.Selection==="emitter"?this.ApplyParameter("emitterEnabled",!1):(this.ApplyParameter("obstacleType",0),this.SelectObject("domain")))}),o("#reset-properties").addEventListener("click",()=>{this.VisibleKeys.forEach(e=>this.ApplyParameter(e,V[e])),this.Notify("Visible inspector properties restored to editor defaults.")}),o("#add-button").addEventListener("click",()=>{const e=o("#add-menu"),r=o("#add-button").getBoundingClientRect();e.hidden=!e.hidden,e.style.top=`${r.bottom+5}px`,e.style.left=`${r.left-12}px`,o("#add-button").setAttribute("aria-expanded",String(!e.hidden))}),o("#add-menu").addEventListener("click",e=>{const r=e.target.closest("[data-add]");r&&this.AddObject(r.dataset.add)}),document.addEventListener("pointerdown",e=>{e.target.closest("#add-menu, #add-button")||(o("#add-menu").hidden=!0,o("#add-button").setAttribute("aria-expanded","false"))}),E("[data-tool]").forEach(e=>e.addEventListener("click",()=>this.ApplyParameter("interactionMode",e.dataset.tool))),o("#play-button").addEventListener("click",()=>this.ApplyParameter("paused",!this.Parameters.paused)),o("#step-button").addEventListener("click",()=>{this.ApplyParameter("paused",!0),this.SingleStep=!0}),o("#reset-button").addEventListener("click",()=>{this.Restart(),this.Notify("Simulation restarted. Scene settings preserved.")}),o("#burst-button").addEventListener("click",()=>this.TriggerBurst()),o("#speed-select").addEventListener("change",e=>this.ApplyParameter("timeScale",Number(e.target.value))),o("#overlays-button").addEventListener("click",()=>this.ApplyParameter("showBoundingBox",!this.Parameters.showBoundingBox)),o("#turntable-button").addEventListener("click",()=>this.ApplyParameter("autoTurntable",!this.Parameters.autoTurntable)),o("#focus-button").addEventListener("click",()=>this.FocusVolume()),o("#maximize-button").addEventListener("click",()=>{o("#app").classList.toggle("maximized")}),o("#camera-view").addEventListener("change",e=>{const r=e.target.value;r==="perspective"?this.FocusVolume():(this.Camera.targetTheta=r==="side"?Math.PI/2:0,this.Camera.targetPhi=r==="top"?.03:Math.PI/2,this.MarkDirty())}),o("#atlas-toggle").addEventListener("change",e=>this.ApplyParameter("showAtlasMinimap",e.target.checked)),o("#backend-select").addEventListener("change",e=>{this.InitializeRenderer(e.target.value),this.Notify("Backend change restarts the simulation.")}),o("#retry-gpu").addEventListener("click",()=>this.InitializeRenderer("webgl2")),o("#export-button").addEventListener("click",()=>this.SaveScene()),o("#sample-toml-button").addEventListener("click",()=>this.SaveSceneToml());const t=o("#sample-picker");for(const e of Be()){const r=document.createElement("option");r.value=e.identity,r.textContent=e.name,r.title=e.covers,t.append(r)}t.addEventListener("change",e=>{this.LoadSample(e.target.value),e.target.value=""}),o("#import-button").addEventListener("click",()=>o("#import-file").click()),o("#import-file").addEventListener("change",e=>this.OpenScene(e.target.files[0])),o("#help-button").addEventListener("click",()=>o("#help-dialog").showModal()),o("#close-help").addEventListener("click",()=>o("#help-dialog").close()),o("#diagnostics-button").addEventListener("click",()=>{o("#diagnostics").hidden=!o("#diagnostics").hidden}),o("#close-diagnostics").addEventListener("click",()=>{o("#diagnostics").hidden=!0}),o("#library-button").addEventListener("click",()=>{o("#app").classList.toggle("mobile-library"),o("#preset-search").focus()}),o("#workspace-button").addEventListener("click",()=>{o("#app").classList.remove("mobile-library","maximized"),o("#diagnostics").hidden=!0}),document.addEventListener("keydown",e=>this.KeyPress(e)),document.addEventListener("visibilitychange",()=>{this.LastTime=performance.now(),document.hidden&&this.Engine?.setBrush(null,null,!1)}),window.addEventListener("blur",()=>this.Engine?.setBrush(null,null,!1))}FocusVolume(){this.Camera.reset();const i=this.Engine?.getBoundsBox();this.Camera.targetDistance=Math.min(9.5,Math.max(i?.effWidth||this.Parameters.boundsWidth,i?.effHeight||this.Parameters.boundsHeight)*2.3),o("#camera-view").value="perspective",this.MarkDirty()}KeyPress(i){if(o("#flipbook-dialog").open)return;if((i.ctrlKey||i.metaKey)&&i.shiftKey&&i.key.toLowerCase()==="f"){i.preventDefault(),o("#scene-search").focus();return}if((i.ctrlKey||i.metaKey)&&i.key.toLowerCase()==="s"){i.preventDefault(),document.activeElement?.blur(),this.SaveScene();return}if(o("#help-dialog").open||i.target.closest("input,select,textarea,[contenteditable]")||i.ctrlKey||i.metaKey||i.altKey||i.repeat)return;const t=i.key.toLowerCase(),e={" ":()=>this.ApplyParameter("paused",!this.Parameters.paused),s:()=>{this.ApplyParameter("paused",!0),this.SingleStep=!0},r:()=>this.Restart(),d:()=>this.TriggerBurst(),f:()=>this.FocusVolume(),b:()=>this.ApplyParameter("showBoundingBox",!this.Parameters.showBoundingBox),t:()=>this.ApplyParameter("autoTurntable",!this.Parameters.autoTurntable),1:()=>this.ApplyParameter("interactionMode","orbit"),2:()=>this.ApplyParameter("interactionMode","flamethrower"),3:()=>this.ApplyParameter("interactionMode","detonate"),"/":()=>{o("#app").classList.add("mobile-library"),o("#preset-search").focus()},escape:()=>{o("#app").classList.remove("maximized","mobile-library"),o("#add-menu").hidden=!0,o("#diagnostics").hidden=!0}};e[t]&&(i.preventDefault(),e[t]())}ConnectViewport(){let i=null;const t=r=>{if(!this.Engine)return null;const a=this.Canvas.getBoundingClientRect(),l=this.Engine.getBoundsBox();return this.Camera.raycastVolumeUVW((r.clientX-a.left)/a.width*2-1,1-(r.clientY-a.top)/a.height*2,l.boxMin,l.boxMax)};this.Canvas.addEventListener("contextmenu",r=>r.preventDefault()),this.Canvas.addEventListener("pointerdown",r=>{if(r.button>2)return;this.Canvas.setPointerCapture(r.pointerId);const a=r.button===2||r.button===1?"pan":r.shiftKey?"flamethrower":this.Parameters.interactionMode;i={X:r.clientX,Y:r.clientY,Mode:a,Hit:t(r)},a==="detonate"&&(i.Hit?this.TriggerBurst("burst",i.Hit):this.Notify("Click inside the domain to place a burst.")),a==="flamethrower"&&i.Hit&&this.Engine?.setBrush(i.Hit,[0,3,0],!0)}),this.Canvas.addEventListener("pointermove",r=>{if(!i)return;const a=r.clientX-i.X,l=r.clientY-i.Y;if(i.Mode==="orbit"&&(this.Camera.orbit(a,l),this.MarkDirty()),i.Mode==="pan"&&(this.Camera.pan(a,l),this.MarkDirty()),i.Mode==="flamethrower"){const n=t(r),u=n?.map((h,m)=>(h-(i.Hit?.[m]??h))*55+(m===1?3:0));this.Engine?.setBrush(n,u,!!n),i.Hit=n}i.X=r.clientX,i.Y=r.clientY}),["pointerup","pointercancel","lostpointercapture"].forEach(r=>this.Canvas.addEventListener(r,()=>{i=null,this.Engine?.setBrush(null,null,!1)})),this.Canvas.addEventListener("wheel",r=>{r.preventDefault(),this.Camera.zoom(Math.max(-100,Math.min(100,r.deltaY))),this.MarkDirty()},{passive:!1});const e=this.Canvas;this.Canvas.addEventListener("webglcontextlost",r=>{if(r.preventDefault(),e!==this.Canvas){const a=this.Documents?.Slots.find(l=>l.State?.Canvas===e);a&&(a.State.Fault="This document lost its GPU context. Retry to rebuild it from its settings.");return}this.ShowGpuError("WebGL context lost. Retry to rebuild the simulation; settings are preserved.")})}Frame(i){requestAnimationFrame(e=>this.Frame(e));const t=Math.max(.001,(i-this.LastTime)/1e3);if(this.LastTime=i,!(document.hidden||this.Switching||this.Baking||!o("#gpu-error").hidden)){if(this.Elapsed+=t,this.Frames++,this.Parameters.autoTurntable&&(this.Camera.targetTheta+=Math.min(t,.05)*.35),this.Camera.update(Math.min(t,.1)),this.Engine){const e=[this.Parameters.obstacleX,this.Parameters.obstacleY,this.Parameters.obstacleZ],r=K(this.Parameters,this.Engine.time);[this.Parameters.obstacleX,this.Parameters.obstacleY,this.Parameters.obstacleZ]=r;try{if(!this.Parameters.paused||this.SingleStep){const a=this.Bursts.filter(l=>l.Time<=this.Engine.time);this.Bursts=this.Bursts.filter(l=>l.Time>this.Engine.time),a.forEach(l=>this.Engine.triggerExplosion(l.Options)),this.Engine.stepSimulation(this.SingleStep?1/60:t),this.SingleStep=!1}this.Engine.render(this.Camera),this.RenderBounds()}catch(a){this.ShowGpuError(a.message)}finally{[this.Parameters.obstacleX,this.Parameters.obstacleY,this.Parameters.obstacleZ]=e}}if(this.Elapsed>=.5){this.FramesPerSecond=Math.round(this.Frames/this.Elapsed),this.Frames=0,this.Elapsed=0,o("#fps").textContent=this.Parameters.paused?"—":this.FramesPerSecond;const e=this.Engine?.time||0;o("#timecode").textContent=`${String(Math.floor(e/60)).padStart(2,"0")}:${(e%60).toFixed(3).padStart(6,"0")}`,o("#frame-counter").textContent=`FRAME ${String(this.Engine?.stepCount||0).padStart(4,"0")}`,o("#playhead").style.left=`${e%30/30*100}%`;const r=Math.floor(e/30)*30;E(".ruler-numbers span").forEach((l,n)=>{l.textContent=`${r+n*5}s`});const a=this.Engine?.getBoundsBox();a&&(o("#bounds-status").textContent=`${a.effWidth.toFixed(1)} × ${a.effHeight.toFixed(1)} × ${a.effWidth.toFixed(1)} m`),o("#diagnostic-values").innerHTML=`<dt>Backend</dt><dd>${this.Backend==="webgpu"?"WebGPU":"WebGL2"}</dd><dt>Voxel grid</dt><dd>${this.Parameters.gridResolution}³</dd><dt>Canvas</dt><dd>${this.Canvas.width} × ${this.Canvas.height}</dd><dt>Ray / shadow steps</dt><dd>${this.Parameters.raymarchSteps} / ${this.Parameters.shadowSteps}</dd><dt>Simulation steps</dt><dd>${this.Engine?.stepCount||0}</dd><dt>CPU submission</dt><dd>${(this.Engine?.simDurationMs||0).toFixed(2)} ms</dd><dt>Queued bursts</dt><dd>${this.Bursts.length+(this.Engine?.pendingBlasts.length||0)}</dd>`,this.Parameters.autoGpuGovernor&&!this.Parameters.paused&&(this.FramesPerSecond<35&&this.Parameters.raymarchSteps>36?this.ApplyParameter("raymarchSteps",Math.max(36,this.Parameters.raymarchSteps-4)):this.FramesPerSecond>=58&&this.Parameters.raymarchSteps<96&&this.ApplyParameter("raymarchSteps",Math.min(96,this.Parameters.raymarchSteps+4)))}}}}window.fluidEditor=new Ve;
