import {grayscalePaperV110323} from '../paperQualityV110323.js';
import { assessDocumentQuality, normalizePaperLighting } from './DocumentQualityV11036.js';
import { detectDocumentEdgesV3 } from './EdgeDetectorV3.js';
import { restoreDocumentV3 } from './RestoreEngineV3.js';
import { selectBestOCRVariantV3 } from './OCRPipelineV3.js';
import {
  decodeImageFileV3,
  imageDataToFileV3,
  rotateImageDataClockwiseV3,
} from './imageUtilsV3.js';
import {
  ROAD_READY_SCANNER_V3_VERSION,
  orderCornersV3,
  rotateCornersClockwiseV3,
  uidV3,
} from './scannerTypesV3.js';
import { boundaryCornersV1093 } from './CurvedBoundaryV1093.js';
import { autoFixDocumentV1093 } from './AutoQualityBotV1093.js';
import { autoOrientDocumentV10943 } from './DocumentOrientationV10943.js';
import { warpPerspectiveV10934 } from './PerspectiveEngineV10934.js';

function captureAsset(kind, file, metadata = {}) {
  return {
    kind,
    file,
    pageIndex:0,
    immutable:kind === 'original',
    primary:metadata.primary === true,
    geometryMode:metadata.geometryMode || '',
    filter:metadata.filter || '',
    createdAt:new Date().toISOString(),
  };
}

function fourCornerInput(input, fallbackCorners) {
  const candidate = Array.isArray(input)
    ? input
    : input && typeof input === 'object'
      ? boundaryCornersV1093(input)
      : fallbackCorners;
  return orderCornersV3(Array.isArray(candidate) && candidate.length >= 4 ? candidate : fallbackCorners);
}

function rotateForSession(image, rotation = 0) {
  let output = image;
  const turns = ((Math.round(Number(rotation || 0) / 90) % 4) + 4) % 4;
  for (let index = 0; index < turns; index += 1) output = rotateImageDataClockwiseV3(output);
  return output;
}

function resizeImageDataV10933(image, maxDimension = 2400) {
  if (!image?.data || !image.width || !image.height) return image;
  const maximum = Math.max(image.width, image.height);
  if (maximum <= maxDimension || typeof document === 'undefined') return image;
  const scale = maxDimension / maximum;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const source = document.createElement('canvas');
  source.width = image.width;
  source.height = image.height;
  const sourceContext = source.getContext('2d', { alpha:false });
  const sourcePixels = image instanceof ImageData
    ? image
    : new ImageData(image.data, image.width, image.height);
  sourceContext.putImageData(sourcePixels, 0, 0);

  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const context = output.getContext('2d', { alpha:false, willReadFrequently:true });
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

export class ScannerEngineV3 {
  constructor(options = {}) {
    this.maxPreviewDimension = options.maxPreviewDimension || 2200;
    this.maxFinalInputDimension = options.maxFinalInputDimension || 4096;
    this.maxOutputDimension = options.maxOutputDimension || 3000;
    this.maxOcrDimension = options.maxOcrDimension || 3000;
  }

  async prepare(file, options = {}) {
    options.onStatus?.('Opening photo for corner review…');
    const workingImage = await decodeImageFileV3(file, {
      maxDimension:options.fastProcess ? this.maxFinalInputDimension : options.maxPreviewDimension || this.maxPreviewDimension,
    });
    options.onStatus?.('Finding the four paper corners…');
    const detection = detectDocumentEdgesV3(workingImage);
    const corners = orderCornersV3(detection.corners);
    const reviewFile = options.fastProcess ? null : await imageDataToFileV3(
      workingImage,
      'road-ready-review-v10933.jpg',
      .97,
    );
    return {
      id:uidV3('scanner_v10933'),
      finalSourceReady:options.fastProcess === true,
      source:options.source || 'camera',
      originalFile:file,
      reviewFile,
      workingImage,
      corners,
      detection:{
        ...detection,
        corners,
      },
      rotation:0,
      createdAt:new Date().toISOString(),
    };
  }

  async rotate(session, options = {}) {
    options.onStatus?.('Rotating document…');
    const workingImage = rotateImageDataClockwiseV3(session.workingImage);
    const reviewFile = await imageDataToFileV3(
      workingImage,
      'road-ready-review-v10933-rotated.jpg',
      .97,
    );
    const corners = orderCornersV3(rotateCornersClockwiseV3(session.corners));
    return {
      ...session,
      workingImage,
      reviewFile,
      corners,
      detection:{
        ...(session.detection || {}),
        corners,
      },
      rotation:(Number(session.rotation || 0) + 90) % 360,
    };
  }

  async finalize(session, cornersOrLegacyBoundary, options = {}) {
    options.onStatus?.('Reopening the original photo at full detail…');
    const corners = fourCornerInput(cornersOrLegacyBoundary, session.corners);
    let finalSource;
    try {
      finalSource = session.finalSourceReady && !session.rotation ? session.workingImage : await decodeImageFileV3(session.originalFile, {
        maxDimension:this.maxFinalInputDimension,
      });
      finalSource = rotateForSession(finalSource, session.rotation);
    } catch {
      finalSource = session.workingImage;
    }

    const inputQualityV11036 = assessDocumentQuality(finalSource, {corners});
    options.onStatus?.('Recovering the physical page ratio…');
    const geometryMode = 'projective-native-detail-v10934';
    let corrected = warpPerspectiveV10934(
      finalSource,
      corners,
      {
        maxDimension:this.maxOutputDimension,
        maxUpscale:1,
        snapToStandard:true,
        snapTolerance:.095,
        usLetterBias:true,
        trimRatio:0,
        bicubicMaxPixels:6200000,
      },
    );
    options.onStatus?.('Straightening page orientation and text lines…');
    const straightened = options.preserveOrientation ? {image:corrected} : autoOrientDocumentV10943(corrected, {
      pageFormat:corrected.pageFormat,
      pageFormatLabel:corrected.pageFormatLabel,
    });
    corrected = straightened.image;
    finalSource = null;
    await Promise.resolve();

    options.onStatus?.('Saving the high-detail perspective layer…');
    const correctedFile = await imageDataToFileV3(
      corrected,
      'road-ready-projective-native-detail.jpg',
      .995,
    );

    options.onStatus?.('Cleaning paper and sharpening text in one fast pass…');
    const documentQualityV11036 = inputQualityV11036;
    const normalizedDisplay = normalizePaperLighting(corrected);
    let displayFixed = { display:normalizedDisplay, metadata:{method:'local-paper-illumination-v11036',coloredInkPreserved:true} };
    const displayFile = await imageDataToFileV3(
      displayFixed.display,
      'road-ready-final-source-detail.jpg',
      .985,
    );
    const displayMetadata = displayFixed.metadata;
    displayFixed = null;
    await Promise.resolve();

    options.onStatus?.('Building a separate OCR-safe image…');
    const ocrSource = resizeImageDataV10933(corrected, this.maxOcrDimension);
    const normalizedOcr = ocrSource === corrected ? normalizedDisplay : normalizePaperLighting(ocrSource);
    const restored = {color:normalizedOcr,metadata:{method:'paper-detail-v110323'}};
    const ocrFixed = {clean:grayscalePaperV110323(normalizedOcr),metadata:{method:'lossless-grayscale-v110323'}};
    ocrFixed.highContrast = ocrFixed.clean;
    const ocr = {selected:{name:'grayscale'},ranked:[]};

    const cleanFile = await imageDataToFileV3(
      ocrFixed.clean,
      'road-ready-clean-ocr.png',
      .975,
    );
    const highContrastFile = cleanFile;
    const byName = {
      restoredColor:displayFile,
      grayscale:cleanFile,
      highContrast:highContrastFile,
    };
    const ocrFile = byName[ocr.selected?.name]
      || (ocrFixed.ocr === ocrFixed.highContrast ? highContrastFile : cleanFile);

    const captureAssets = [
      captureAsset('original', session.originalFile, {
        geometryMode:'immutable-source',
      }),
      captureAsset('perspective-corrected', correctedFile, {
        geometryMode,
      }),
      captureAsset('display-final', displayFile, {
        geometryMode,
        filter:'source-detail-primary-v10934',
        primary:true,
      }),
      captureAsset('clean-ocr', cleanFile, {
        filter:'paper-detail-v110323',
      }),
      captureAsset('high-contrast-ocr', highContrastFile, {
        filter:'high-contrast-ocr-v10934',
      }),
      captureAsset('ocr-selected', ocrFile, {
        filter:`selected-${ocr.selected?.name || 'clean'}-v10934`,
      }),
    ];

    return {
      originalFile:session.originalFile,
      displayFile,
      ocrFile,
      metadata:{
        source:`road-ready-scanner-v10934-${session.source}`,
        scannerVersion:ROAD_READY_SCANNER_V3_VERSION,
        pageCount:1,
        originalPreserved:true,
        documentQualityV11036,
        primaryOutput:'displayFile',
        perspectiveCorrected:true,
        captureAssets,
        captureManifest:{
          version:ROAD_READY_SCANNER_V3_VERSION,
          engine:'Road Ready Scanner 0.4.5 projective source-detail renderer',
          localOnly:true,
          source:session.source,
          rotation:(Number(session.rotation || 0) + Number(straightened.rotationDegrees || 0)) % 360,
          manualRotation:Number(session.rotation || 0),
          autoRotation:Number(straightened.rotationDegrees || 0),
          autoDeskew:Number(straightened.deskewDegrees || 0),
          boundary:{
            model:'straight-four-corner',
            visibleHandles:4,
            internalBoundaryPoints:4,
            corners,
            geometryMode,
          },
          detection:{
            confidence:session.detection?.confidence || 0,
            method:session.detection?.method || '',
            metrics:session.detection?.metrics || {},
          },
          perspective:{
            method:geometryMode,
            operation:'projective-ratio-native-resolution-correction',
            width:corrected.width,
            height:corrected.height,
            pageFormat:corrected.pageFormat,
            pageFormatLabel:corrected.pageFormatLabel,
            formatConfidence:corrected.formatConfidence,
            formatReason:corrected.formatReason,
            measuredAspect:corrected.measuredAspect,
            projectiveAspect:corrected.projectiveAspect,
            portraitRatio:corrected.portraitRatio,
            outputAspect:corrected.outputAspect,
            aspectMethod:corrected.aspectMethod,
            perspectiveStrength:corrected.perspectiveStrength,
            focalLength:corrected.focalLength,
            renderScale:corrected.renderScale,
            interpolation:corrected.interpolation,
            autoRotationDegrees:straightened.rotationDegrees,
            autoDeskewDegrees:straightened.deskewDegrees,
            orientationConfidence:straightened.confidence,
            orientationReason:straightened.reason,
            horizontalTextScore:straightened.horizontalScore,
            verticalTextScore:straightened.verticalScore,
          },
          sourceResolution:{
            reviewWidth:session.workingImage?.width || 0,
            reviewHeight:session.workingImage?.height || 0,
            finalInputLimit:this.maxFinalInputDimension,
            outputLimit:this.maxOutputDimension,
            ocrLimit:this.maxOcrDimension,
          },
          restore:{
            ...(restored.metadata || {}),
            autoQuality:displayMetadata,
            ocrAutoQuality:ocrFixed.metadata,
          },
          output:{
            mimeType:'image/jpeg',
            jpegQuality:.995,
            maxDimension:this.maxOutputDimension,
            primaryFile:'display-final',
          },
          persistence:{
            primaryFile:'display-final',
            originalAsset:'original',
            ocrAsset:'ocr-selected',
          },
          ocrSelection:{
            selected:ocr.selected?.name || 'clean',
            scores:ocr.ranked.map(item => ({
              name:item.name,
              score:item.score,
              metrics:item.metrics,
            })),
          },
          completedAt:new Date().toISOString(),
        },
        displayFile,
        ocrFile,
      },
    };
  }
}

export const scannerEngineV3 = new ScannerEngineV3();
