import { composePageFiles, filesFromNativeScan } from './documentScannerEngine.js';
import {
  CAPTURE_SOURCE_V106,
  ROAD_READY_SCANNER_CONTRACT_V106,
  ROAD_READY_SCANNER_VERSION_V106,
  assertScannerAdapterV106,
  createScannedPacketV106,
} from './scannerContractsV106.js';
import { createWebScannerAdapterV106 } from './webScannerAdapterV106.js';

function nativeBridgeV106() {
  if (typeof window === 'undefined') return null;
  const capacitorPlugin = window.Capacitor?.Plugins?.RoadReadyScanner
    || window.Capacitor?.Plugins?.DocumentScanner
    || null;
  return window.RoadReadyNative
    || window.roadReadyNative
    || capacitorPlugin
    || null;
}

export function nativeScannerAvailableV106() {
  const bridge = nativeBridgeV106();
  return Boolean(bridge && (
    typeof bridge.scanDocumentV2 === 'function'
    || typeof bridge.scanDocument === 'function'
    || typeof bridge.captureDocument === 'function'
  ));
}

function nativeMethodV106(bridge) {
  if (typeof bridge?.scanDocumentV2 === 'function') return bridge.scanDocumentV2.bind(bridge);
  if (typeof bridge?.captureDocument === 'function') return bridge.captureDocument.bind(bridge);
  if (typeof bridge?.scanDocument === 'function') return bridge.scanDocument.bind(bridge);
  return null;
}

function platformV106() {
  if (typeof window === 'undefined') return 'web';
  const platform = window.Capacitor?.getPlatform?.();
  if (platform) return platform;
  const agent = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/i.test(agent)) return 'ios';
  if (/Android/i.test(agent)) return 'android';
  return 'web';
}

function nativeOptionsV106(options = {}) {
  const platform = platformV106();
  return {
    contract:ROAD_READY_SCANNER_CONTRACT_V106,
    scannerVersion:ROAD_READY_SCANNER_VERSION_V106,
    platform,
    multiPage:options.multiPage !== false,
    autoCapture:options.autoCapture !== false,
    allowGallery:true,
    preserveOriginal:true,
    returnOriginals:true,
    returnMasks:true,
    returnCleanedPages:true,
    output:['jpeg','pdf'],
    filters:['auto','color','gray','bw'],
    qualityGate:true,
    candidateLimit:3,
    ios:{
      documentCamera:'VNDocumentCameraViewController',
      segmentation:'VNDetectDocumentSegmentationRequest',
      rectangles:'VNDetectRectanglesRequest',
      structuredRecognition:'RecognizeDocumentsRequest',
      accurateText:'RecognizeTextRequest',
    },
    android:{
      mode:'ML_KIT_DOCUMENT_SCANNER_FULL',
      automaticCapture:true,
      perspectiveCorrection:true,
      automaticRotation:true,
      shadowRemoval:true,
      stainRemoval:true,
      fingerCleanup:true,
    },
    ...options.native,
  };
}

function nativeOriginalInputsV106(result = {}) {
  if (Array.isArray(result.originalFiles)) return result.originalFiles;
  if (Array.isArray(result.originals)) return result.originals;
  if (Array.isArray(result.sourcePages)) return result.sourcePages;
  return [];
}

function nativeCleanedInputsV106(result = {}) {
  if (Array.isArray(result.cleanedFiles)) return result.cleanedFiles;
  if (Array.isArray(result.cleanedPages)) return result.cleanedPages;
  if (Array.isArray(result.files)) return result.files;
  if (Array.isArray(result.pages)) return result.pages;
  return [];
}

async function inputsToFilesV106(inputs = [], prefix = 'native-page') {
  return filesFromNativeScan({
    pages:inputs.map((input, index) => {
      if (input && typeof input === 'object' && !input.fileName) return { ...input, fileName:`${prefix}-${index + 1}.jpg` };
      return input;
    }),
  });
}

export class NativeScannerAdapterV106 {
  constructor(options = {}) {
    this.contract = ROAD_READY_SCANNER_CONTRACT_V106;
    this.version = ROAD_READY_SCANNER_VERSION_V106;
    this.bridge = options.bridge || nativeBridgeV106();
    this.web = options.web || createWebScannerAdapterV106(options);
  }

  async captureDocument(options = {}) {
    const method = nativeMethodV106(this.bridge);
    if (!method) return this.web.captureDocument(options);
    const result = await method(nativeOptionsV106(options));
    const originalFiles = await inputsToFilesV106(nativeOriginalInputsV106(result), 'native-original');
    const cleanedFiles = await inputsToFilesV106(nativeCleanedInputsV106(result), 'native-cleaned');
    const usableOriginals = originalFiles.length ? originalFiles : cleanedFiles;
    if (!usableOriginals.length) throw new Error('native_scanner_returned_no_pages');

    const pages = [];
    for (let index = 0; index < usableOriginals.length; index += 1) {
      const original = usableOriginals[index];
      const cleaned = cleanedFiles[index] || original;
      const page = await this.web.processNativePage(original, cleaned, {
        index,
        source:CAPTURE_SOURCE_V106.native,
        onStatus:options.onStatus,
      });
      if (page) pages.push(page);
    }

    return createScannedPacketV106({
      source:CAPTURE_SOURCE_V106.native,
      pages,
      originalPreserved:Boolean(originalFiles.length),
      trace:{
        native:true,
        platform:platformV106(),
        nativeResultVersion:result?.version || '',
        originalPreserved:Boolean(originalFiles.length),
        bridgeCapabilities:result?.capabilities || {},
      },
    });
  }

  async importImages(files = [], options = {}) {
    return this.web.importImages(files, options);
  }

  async detectDocumentRegions(image, options = {}) {
    const nativeSource = options.nativeSource || image?.nativeUri || image?.uri || '';
    if (nativeSource && typeof this.bridge?.detectDocumentRegions === 'function') {
      try {
        const result = await this.bridge.detectDocumentRegions({
          contract:ROAD_READY_SCANNER_CONTRACT_V106,
          source:nativeSource,
          ...options,
        });
        if (Array.isArray(result?.candidates) && result.candidates.length) return result.candidates;
      } catch {}
    }
    return this.web.detectDocumentRegions(image, options);
  }

  async rectifyCandidate(candidate, source, options = {}) {
    return this.web.rectifyCandidate(candidate, source, options);
  }

  async assessQuality(page = {}) {
    return this.web.assessQuality(page);
  }

  async processCandidates(originalFile, candidates = [], options = {}) {
    return this.web.processCandidates(originalFile, candidates, options);
  }

  async snapPointToEdge(source, point, options = {}) {
    return this.web.snapPointToEdge(source, point, options);
  }

  async composeOriginals(files = [], name = `road-ready-originals-${Date.now()}.jpg`) {
    return composePageFiles(files, name);
  }
}

export function createScannerAdapterV106(options = {}) {
  if (options.forceWeb || !nativeScannerAvailableV106()) return createWebScannerAdapterV106(options);
  return assertScannerAdapterV106(new NativeScannerAdapterV106(options));
}
