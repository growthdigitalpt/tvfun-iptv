/* TV Fun — shader de transição (WebGL puro, autocontido). Expõe window.fxPlay() e auto-conecta aos modais. */
(function () {
  var canvas = document.createElement('canvas');
  canvas.id = 'fxCanvas';
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:2147483646;opacity:0;pointer-events:none;transition:opacity .32s ease';
  var ready = false, gl = null, uTime = null, uRes = null, running = false, raf = 0, t0 = 0, hide = 0;

  function init() {
    try {
      gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return;
      function mk(t, s) { var sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null; }
      var vs = mk(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}');
      var fs = mk(gl.FRAGMENT_SHADER, 'precision highp float;uniform vec2 resolution;uniform float time;void main(void){vec2 uv=(gl_FragCoord.xy*2.0-resolution.xy)/min(resolution.x,resolution.y);float t=time*0.05;float lw=0.002;vec3 c=vec3(0.0);for(int j=0;j<3;j++){for(int i=0;i<5;i++){c[j]+=lw*float(i*i)/abs(fract(t-0.01*float(j)+float(i)*0.01)*5.0-length(uv)+mod(uv.x+uv.y,0.2));}}gl_FragColor=vec4(c,1.0);}');
      if (!vs || !fs) return;
      var pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
      gl.useProgram(pr);
      var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      var lp = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 2, gl.FLOAT, false, 0, 0);
      uRes = gl.getUniformLocation(pr, 'resolution'); uTime = gl.getUniformLocation(pr, 'time');
      ready = true; resize();
    } catch (e) {}
  }
  function resize() { if (!ready) return; canvas.width = Math.floor((canvas.clientWidth || window.innerWidth) / 2); canvas.height = Math.floor((canvas.clientHeight || window.innerHeight) / 2); gl.viewport(0, 0, canvas.width, canvas.height); gl.uniform2f(uRes, canvas.width, canvas.height); }
  function loop() { if (!running) { raf = 0; return; } try { gl.uniform1f(uTime, (performance.now() - t0) * 0.05); gl.drawArrays(gl.TRIANGLES, 0, 6); } catch (e) {} raf = requestAnimationFrame(loop); }

  window.fxPlay = function () {
    if (!ready) return;
    if (!canvas.width) resize();
    t0 = performance.now(); running = true; canvas.style.opacity = '1';
    if (!raf) raf = requestAnimationFrame(loop);
    if (hide) clearTimeout(hide);
    hide = setTimeout(function () { canvas.style.opacity = '0'; setTimeout(function () { running = false; }, 340); }, 300);
  };

  function observeModals() {
    if (!('MutationObserver' in window)) return;
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var t = muts[i].target, old = muts[i].oldValue || '';
        if (t.classList && t.classList.contains('modal') && t.classList.contains('open') && t.id !== 'importModal' && old.indexOf('open') < 0) { window.fxPlay(); break; }
      }
    });
    [].forEach.call(document.querySelectorAll('.modal'), function (el) { mo.observe(el, { attributes: true, attributeFilter: ['class'], attributeOldValue: true }); });
  }

  function boot() {
    document.body.appendChild(canvas);
    init();
    window.addEventListener('resize', resize);
    observeModals();
  }
  if (document.readyState !== 'loading') boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
