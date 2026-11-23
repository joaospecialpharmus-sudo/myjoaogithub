function supportsWebkitPictureInPicture(video) {
  if (typeof video.webkitSetPresentationMode !== 'function') return false;
  return typeof video.webkitSupportsPresentationMode !== 'function'
    || video.webkitSupportsPresentationMode('picture-in-picture');
}

export function supportsPictureInPicture(video, documentObject) {
  return (documentObject.pictureInPictureEnabled === true
      && typeof video.requestPictureInPicture === 'function')
    || supportsWebkitPictureInPicture(video);
}

export function isPictureInPictureActive(video, documentObject) {
  return documentObject.pictureInPictureElement === video
    || video.webkitPresentationMode === 'picture-in-picture';
}

export async function togglePictureInPicture(video, documentObject) {
  if (documentObject.pictureInPictureElement === video) {
    await documentObject.exitPictureInPicture();
    return false;
  }
  if (video.webkitPresentationMode === 'picture-in-picture') {
    video.webkitSetPresentationMode('inline');
    return false;
  }
  if (documentObject.pictureInPictureEnabled === true
    && typeof video.requestPictureInPicture === 'function') {
    await video.requestPictureInPicture();
    return true;
  }
  if (supportsWebkitPictureInPicture(video)) {
    video.webkitSetPresentationMode('picture-in-picture');
    return true;
  }
  throw new Error('Este navegador não oferece mini janela Picture-in-Picture para este vídeo.');
}
