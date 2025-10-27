import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, doc, setDoc } from 'firebase/firestore';
import { db, auth, storage } from '../../utils/firebaseClient';
import { updatePackage } from '../../utils/packagesService';

let observer: MutationObserver | null = null;
let active = false;

function makeButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Admin upload image');
  btn.style.position = 'absolute';
  btn.style.right = '8px';
  btn.style.bottom = '8px';
  btn.style.zIndex = '9999';
  btn.style.background = 'rgba(0,0,0,0.6)';
  btn.style.border = '1px solid rgba(255,255,255,0.08)';
  btn.style.color = 'white';
  btn.style.padding = '6px';
  btn.style.borderRadius = '6px';
  btn.style.cursor = 'pointer';
  btn.innerText = '👁️';
  return btn;
}

function showUrlModal(defaultValue: string): Promise<string | null> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.style.position = 'fixed';
    backdrop.style.inset = '0';
    backdrop.style.background = 'rgba(0,0,0,0.5)';
    backdrop.style.zIndex = '10000';

    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '50%';
    modal.style.left = '50%';
    modal.style.transform = 'translate(-50%, -50%)';
    modal.style.background = 'white';
    modal.style.padding = '16px';
    modal.style.borderRadius = '10px';
    modal.style.width = 'min(92vw, 560px)';
    modal.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)';

    const title = document.createElement('div');
    title.textContent = 'Pegar URL de la imagen nueva';
    title.style.fontWeight = '600';
    title.style.marginBottom = '8px';

    const input = document.createElement('input');
    input.type = 'url';
    input.placeholder = 'https://...';
    input.value = defaultValue || '';
    input.style.width = '100%';
    input.style.border = '1px solid #ddd';
    input.style.padding = '10px';
    input.style.borderRadius = '6px';

    const actions = document.createElement('div');
    actions.style.marginTop = '12px';
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '8px';

    const cancel = document.createElement('button');
    cancel.textContent = 'Cancelar';
    cancel.onclick = () => { document.body.removeChild(backdrop); resolve(null); };

    const ok = document.createElement('button');
    ok.textContent = 'Guardar';
    ok.style.background = 'black';
    ok.style.color = 'white';
    ok.style.padding = '8px 12px';
    ok.style.borderRadius = '6px';
    ok.onclick = () => { const v = input.value.trim(); document.body.removeChild(backdrop); resolve(v || null); };

    actions.appendChild(cancel);
    actions.appendChild(ok);

    modal.appendChild(title);
    modal.appendChild(input);
    modal.appendChild(actions);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    setTimeout(() => input.focus(), 50);
  });
}

async function uploadFileAndGetURL(file: File) {
  if (!auth || !auth.currentUser) {
    window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'Debes iniciar sesión como administrador para subir imágenes.', type: 'error' } }));
    throw new Error('NOT_AUTHENTICATED');
  }
  const key = `site_admin_uploads/${Date.now()}-${file.name}`;
  const storageRef = ref(storage, key);
  try {
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    return url;
  } catch (e: any) {
    console.error('Upload failed', e);
    if (e && e.code === 'storage/unauthorized') {
      window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'No tienes permiso para subir archivos al storage. Verifica las reglas de Firebase Storage o tu sesión de administrador.', type: 'error' } }));
    } else {
      window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'Error al subir la imagen. Revisa la consola para más detalles.', type: 'error' } }));
    }
    throw e;
  }
}

async function saveOverrideForImage(img: HTMLImageElement, newUrl: string) {
  const key = btoa(unescape(encodeURIComponent(img.src)));
  const col = collection(db, 'image_overrides');
  await setDoc(doc(col, key), { original: img.src, override: newUrl, updatedAt: Date.now() });
  img.src = newUrl;
  window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'Imagen actualizada para todo el sitio', type: 'success' } }));
}

async function handleFilesForImage(img: HTMLImageElement, files: FileList | null) {
  if (!files || files.length === 0) return;
  // If multiple files and parent contains multiple images, distribute
  const parent = img.parentElement;
  const siblingsImgs = parent ? Array.from(parent.querySelectorAll('img')) as HTMLImageElement[] : [img];
  const fileArray = Array.from(files);
  const urls = [] as string[];
  for (const f of fileArray) {
    try {
      const url = await uploadFileAndGetURL(f);
      urls.push(url);
    } catch (e) {
      console.error('Upload failed', e);
    }
  }

  if (urls.length === 0) return;

  if (fileArray.length > 1 && siblingsImgs.length > 1) {
    // map urls to siblings
    for (let i = 0; i < Math.min(urls.length, siblingsImgs.length); i++) {
      siblingsImgs[i].src = urls[i];
    }
  } else {
    // single replacement
    img.src = urls[0];
  }

  // If image belongs to a package (data-pkg-id), update package image_url to first url
  const pkgId = img.getAttribute('data-pkg-id');
  if (pkgId) {
    try {
      await updatePackage(pkgId, { image_url: urls[0] });
      window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'Imagen actualizada y guardada en el paquete', type: 'success' } }));
    } catch (e) {
      console.error('Failed to update package', e);
      window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'Imagen subida, pero no se pudo actualizar el paquete en la base de datos', type: 'error' } }));
    }
  } else {
    window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'Imagen sustituida (cambios no persistidos en la base de datos)', type: 'info' } }));
  }
}

function addOverlayToImage(img: HTMLImageElement) {
  try {
    if ((img as any).__admin_overlay_added) return;
    // Skip images managed by admin editors (packages/products)
    if (img.hasAttribute('data-pkg-id')) return;
    const parent = img.parentElement;
    if (!parent) return;
    const prevPos = window.getComputedStyle(parent).position;
    if (prevPos === 'static') {
      parent.style.position = 'relative';
    }

    const btn = makeButton();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.style.display = 'none';

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const pkgId = img.getAttribute('data-pkg-id');
      if (pkgId) {
        window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'Este elemento se edita desde el administrador de paquetes.', type: 'info' } }));
        return;
      }
      const pasted = await showUrlModal(img.src);
      if (!pasted) return;
      try {
        await saveOverrideForImage(img, pasted);
      } catch (err) {
        console.error(err);
        window.dispatchEvent(new CustomEvent('adminToast', { detail: { message: 'No se pudo guardar el cambio', type: 'error' } }));
      }
    });

    // keep legacy input for optional upload flow
    input.addEventListener('change', () => handleFilesForImage(img, input.files));

    parent.appendChild(btn);
    parent.appendChild(input);

    (img as any).__admin_overlay_added = true;
  } catch (e) {
    console.error('addOverlayToImage error', e);
  }
}

function removeAllOverlays() {
  const addedInputs = Array.from(document.querySelectorAll('input[type="file"][style]')) as HTMLInputElement[];
  for (const inp of addedInputs) {
    inp.remove();
  }
  const addedButtons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
  for (const btn of addedButtons) {
    if (btn.innerText === '👁️' && btn.style && btn.style.zIndex === '9999') {
      btn.remove();
    }
  }
  // remove __admin_overlay_added flags
  const imgs = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
  imgs.forEach(img => { try { delete (img as any).__admin_overlay_added; } catch(_){} });
}

export function initImageAdminOverlay() {
  if (active) return;

  active = true;
  // initial pass
  const imgs = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
  imgs.forEach(addOverlayToImage);

  // observe future images
  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        m.addedNodes.forEach(node => {
          if (!(node instanceof HTMLElement)) return;
          const newImgs = Array.from(node.querySelectorAll ? node.querySelectorAll('img') : []) as HTMLImageElement[];
          newImgs.forEach(addOverlayToImage);
          if (node.tagName === 'IMG') addOverlayToImage(node as HTMLImageElement);
        });
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

export function destroyImageAdminOverlay() {
  active = false;
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  removeAllOverlays();
}

export default { initImageAdminOverlay, destroyImageAdminOverlay };
