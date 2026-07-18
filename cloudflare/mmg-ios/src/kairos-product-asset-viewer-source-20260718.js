export const PRODUCT_ASSET_VIEWER_SECTION_FILE = "sections/mmg-product-asset-viewer.liquid";
export const PRODUCT_ASSET_VIEWER_CSS_FILE = "assets/mmg-product-asset-viewer.css";
export const PRODUCT_ASSET_VIEWER_JS_FILE = "assets/mmg-product-asset-viewer.js";

export const PRODUCT_ASSET_VIEWER_SECTION_SOURCE = String.raw`{{ 'mmg-product-asset-viewer.css' | asset_url | stylesheet_tag }}
<script src="{{ 'mmg-product-asset-viewer.js' | asset_url }}" defer="defer"></script>
{% assign sample_pdf = product.metafields.custom.sample_pdf.value %}
<section class="mmg-av" data-mmg-asset-viewer>
  <div class="mmg-av__heading">
    <p>Product preview</p>
    <h2>{{ section.settings.heading }}</h2>
    <span>{{ section.settings.copy }}</span>
  </div>
  {% if product.media.size > 0 %}
    <div class="mmg-av__viewer" aria-roledescription="carousel" aria-label="{{ product.title }} previews">
      <div class="mmg-av__stage" data-mmg-av-stage tabindex="0">
        {% for media in product.media %}
          <figure class="mmg-av__slide{% if forloop.first %} is-active{% endif %}" data-mmg-av-slide data-index="{{ forloop.index0 }}" {% unless forloop.first %}hidden{% endunless %}>
            {% case media.media_type %}
              {% when 'image' %}{{ media | image_url: width: 1800 | image_tag: loading: 'lazy', widths: '480, 760, 1100, 1500, 1800', sizes: '(max-width: 800px) 94vw, 72vw', alt: media.alt | default: product.title }}
              {% when 'video' %}{{ media | video_tag: controls: true, preload: 'metadata', image_size: '1400x' }}
              {% when 'external_video' %}{{ media | external_video_tag }}
              {% when 'model' %}{{ media | model_viewer_tag: reveal: 'interaction', toggleable: true }}
            {% endcase %}
            {% if media.alt != blank %}<figcaption>{{ media.alt }}</figcaption>{% endif %}
          </figure>
        {% endfor %}
        {% if product.media.size > 1 %}
          <button class="mmg-av__nav mmg-av__nav--prev" type="button" data-mmg-av-prev aria-label="Previous preview">‹</button>
          <button class="mmg-av__nav mmg-av__nav--next" type="button" data-mmg-av-next aria-label="Next preview">›</button>
        {% endif %}
      </div>
      {% if product.media.size > 1 %}
        <div class="mmg-av__thumbs" role="tablist" aria-label="Choose a preview">
          {% for media in product.media %}
            <button type="button" role="tab" data-mmg-av-thumb data-index="{{ forloop.index0 }}" aria-selected="{% if forloop.first %}true{% else %}false{% endif %}" aria-label="Preview {{ forloop.index }}">
              {{ media.preview_image | image_url: width: 180 | image_tag: loading: 'lazy', alt: media.alt | default: product.title }}
              {% if media.media_type contains 'video' %}<span>▶</span>{% endif %}
            </button>
          {% endfor %}
        </div>
      {% endif %}
      <div class="mmg-av__meta"><span data-mmg-av-count>1 / {{ product.media.size }}</span><span>Swipe, use arrow keys, or select a thumbnail.</span></div>
    </div>
  {% endif %}
  {% if sample_pdf != blank %}
    <div class="mmg-av__sample"><div><b>Sample available</b><p>Review an approved sample before purchasing.</p></div><a href="{{ sample_pdf.url }}" target="_blank" rel="noopener">Open sample PDF</a></div>
  {% endif %}
</section>
{% schema %}
{"name":"MMG Product Asset Viewer","tag":"section","class":"section-mmg-product-asset-viewer","settings":[{"type":"text","id":"heading","label":"Heading","default":"See what you are getting"},{"type":"textarea","id":"copy","label":"Copy","default":"Review the cover, selected interior pages, examples, and available media before you purchase."}],"presets":[{"name":"MMG Product Asset Viewer"}]}
{% endschema %}`;

export const PRODUCT_ASSET_VIEWER_CSS_SOURCE = String.raw`.mmg-av{max-width:1320px;margin:0 auto;padding:80px 28px;color:#111827}.mmg-av *{box-sizing:border-box}.mmg-av__heading{max-width:760px;margin-bottom:30px}.mmg-av__heading>p{text-transform:uppercase;letter-spacing:.14em;font-size:12px;font-weight:800;color:#1769e0}.mmg-av__heading h2{font:700 clamp(34px,4vw,56px)/1.04 Georgia,serif;letter-spacing:-.04em;margin:10px 0 16px}.mmg-av__heading span{color:#5d6675;line-height:1.65}.mmg-av__viewer{border:1px solid #dfe4eb;border-radius:26px;padding:18px;background:#f7f9fb}.mmg-av__stage{position:relative;min-height:560px;background:#fff;border-radius:18px;display:grid;place-items:center;overflow:hidden;touch-action:pan-y}.mmg-av__slide{margin:0;width:100%;height:100%;min-height:560px;display:grid;place-items:center;padding:24px}.mmg-av__slide[hidden]{display:none}.mmg-av__slide img,.mmg-av__slide video,.mmg-av__slide iframe,.mmg-av__slide model-viewer{max-width:100%;max-height:680px;width:auto;height:auto;border-radius:8px}.mmg-av__slide iframe{width:min(100%,1000px);aspect-ratio:16/9}.mmg-av__slide figcaption{font-size:12px;color:#5d6675;margin-top:12px}.mmg-av__nav{position:absolute;top:50%;transform:translateY(-50%);width:46px;height:46px;border:1px solid #dfe4eb;border-radius:50%;background:rgba(255,255,255,.94);font-size:30px;cursor:pointer;z-index:2}.mmg-av__nav--prev{left:16px}.mmg-av__nav--next{right:16px}.mmg-av__thumbs{display:flex;gap:10px;overflow-x:auto;padding:14px 2px 4px}.mmg-av__thumbs button{position:relative;flex:0 0 74px;height:74px;border:2px solid transparent;border-radius:12px;background:#fff;padding:5px;cursor:pointer}.mmg-av__thumbs button[aria-selected=true]{border-color:#1769e0}.mmg-av__thumbs img{width:100%;height:100%;object-fit:contain}.mmg-av__thumbs span{position:absolute;inset:auto 5px 5px auto;background:#111827;color:#fff;border-radius:50%;width:20px;height:20px;display:grid;place-items:center;font-size:9px}.mmg-av__meta{display:flex;justify-content:space-between;gap:20px;color:#667085;font-size:12px;padding:12px 4px 2px}.mmg-av__sample{margin-top:18px;border:1px solid #dfe4eb;border-radius:18px;padding:20px 22px;display:flex;align-items:center;justify-content:space-between;gap:20px}.mmg-av__sample p{margin:5px 0 0;color:#5d6675}.mmg-av__sample a{background:#1769e0;color:#fff;text-decoration:none;padding:13px 18px;border-radius:12px;font-weight:800;white-space:nowrap}@media(max-width:760px){.mmg-av{padding:58px 16px}.mmg-av__viewer{padding:10px}.mmg-av__stage,.mmg-av__slide{min-height:390px}.mmg-av__slide{padding:16px}.mmg-av__nav{width:40px;height:40px}.mmg-av__meta{display:block}.mmg-av__meta span{display:block;margin-top:5px}.mmg-av__sample{align-items:flex-start;flex-direction:column}.mmg-av__sample a{width:100%;text-align:center}}`;

export const PRODUCT_ASSET_VIEWER_JS_SOURCE = String.raw`class MMGAssetViewer{constructor(root){this.root=root;this.slides=[...root.querySelectorAll('[data-mmg-av-slide]')];this.thumbs=[...root.querySelectorAll('[data-mmg-av-thumb]')];this.stage=root.querySelector('[data-mmg-av-stage]');this.count=root.querySelector('[data-mmg-av-count]');this.index=0;this.startX=null;if(this.slides.length<2)return;root.querySelector('[data-mmg-av-prev]')?.addEventListener('click',()=>this.show(this.index-1));root.querySelector('[data-mmg-av-next]')?.addEventListener('click',()=>this.show(this.index+1));this.thumbs.forEach((el,i)=>el.addEventListener('click',()=>this.show(i)));this.stage?.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();this.show(this.index-1)}if(e.key==='ArrowRight'){e.preventDefault();this.show(this.index+1)}});this.stage?.addEventListener('touchstart',e=>{this.startX=e.changedTouches[0]?.clientX??null},{passive:true});this.stage?.addEventListener('touchend',e=>{if(this.startX===null)return;const dx=(e.changedTouches[0]?.clientX??this.startX)-this.startX;this.startX=null;if(Math.abs(dx)>45)this.show(this.index+(dx<0?1:-1))},{passive:true})}show(next){const total=this.slides.length;this.index=(next+total)%total;this.slides.forEach((el,i)=>{el.hidden=i!==this.index;el.classList.toggle('is-active',i===this.index);if(i!==this.index)el.querySelectorAll('video').forEach(v=>v.pause())});this.thumbs.forEach((el,i)=>el.setAttribute('aria-selected',String(i===this.index)));if(this.count)this.count.textContent=`${this.index+1} / ${total}`}}document.addEventListener('DOMContentLoaded',()=>document.querySelectorAll('[data-mmg-asset-viewer]').forEach(root=>new MMGAssetViewer(root)));`;

function addViewer(templateSource){const template=JSON.parse(templateSource);template.sections.asset_viewer={type:"mmg-product-asset-viewer",settings:{heading:"See what you are getting",copy:"Review the cover, selected interior pages, examples, and available media before you purchase."}};const order=template.order||[];const relatedIndex=order.indexOf("related_products");if(!order.includes("asset_viewer"))order.splice(relatedIndex>=0?relatedIndex:order.length,0,"asset_viewer");template.order=order;return JSON.stringify(template,null,2)}
export function extendProductTemplateWithAssetViewer(templateSource){return addViewer(templateSource)}