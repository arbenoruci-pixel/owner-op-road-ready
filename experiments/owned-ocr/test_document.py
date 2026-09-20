import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFont, PngImagePlugin
from data import collate, read_manifest, image_tensor
from document import geometric_rows, native_usable, read_document
from layout import detect_lines, reverse_print_components
from model import LineReader
from recognize import recognize
from benchmark import compare, metrics


class DocumentReaderTests(unittest.TestCase):
    def test_reverse_print_label_keeps_its_pixels_and_normalizes_polarity(self):
        image=Image.new('L',(110,35),0);draw=ImageDraw.Draw(image);font=ImageFont.load_default(size=20)
        draw.text((8,7),'STOP 1',font=font,fill=255)
        inverted=Image.fromarray(255-np.asarray(image))
        self.assertTrue(torch.equal(image_tensor(image),image_tensor(inverted)))
        page=Image.new('L',(400,160),255);page.paste(image,(20,50))
        boxes,count=reverse_print_components(np.asarray(page),[[20,50,130,85]])
        self.assertEqual(count,1)
        self.assertGreaterEqual(len(boxes),5)

    def test_page_metric_counts_missing_lines_and_unmatched_predictions(self):
        def line(text,x,y):
            return {'text':text,'box':{'x':x,'y':y,'width':.2,'height':.03}}
        truth=[line('ABC',.1,.1),line('DEF',.1,.2)]
        predictions=[line('ABC',.1,.1),line('junk',.7,.7)]
        rows,extras=compare(truth,predictions)
        score=metrics(rows,extras)
        self.assertEqual(score['characterErrorRate'],7/6)
        self.assertEqual(score['lineExactMatch'],.5)
        self.assertEqual(score['unmatchedPredictedCharacters'],4)

    def test_short_line_output_does_not_depend_on_other_batch_width(self):
        torch.set_num_threads(2);torch.manual_seed(31)
        model=LineReader('0123456789').eval()
        short=(torch.rand(1,32,92),'1114')
        alone,_,a,_=collate([short],model.alphabet)
        together,_,b,_=collate([short,(torch.rand(1,32,260),'987654')],model.alphabet)
        with torch.inference_mode():
            expected=model(alone,a)[:,0]
            actual=model(together,b)[:int(a[0]),0]
        self.assertTrue(torch.allclose(expected,actual,atol=1e-6,rtol=1e-6))

    def test_detector_finds_text_in_two_columns_without_table_rules(self):
        image=Image.new('L',(1000,600),255);draw=ImageDraw.Draw(image)
        font=ImageFont.load_default(size=24)
        samples=[(45,70,'LOAD 84751'),(540,70,'CARRIER ALPHA'),(45,175,'TOTAL $875.50'),(540,175,'WEIGHT 19320 LB')]
        for x,y,text in samples:
            draw.text((x,y),text,font=font,fill=0)
        draw.line((20,140,970,140),fill=0,width=2)
        draw.line((495,20,495,350),fill=0,width=2)
        result=detect_lines(image)
        self.assertGreaterEqual(len(result['regions']),4)
        for x,y,text in samples:
            box=draw.textbbox((x,y),text,font=font)
            cx,cy=(box[0]+box[2])/2,(box[1]+box[3])/2
            self.assertTrue(any(r['x']<=cx<=r['x']+r['width'] and r['y']<=cy<=r['y']+r['height'] for r in result['regions']),text)
        self.assertTrue(all(r['width']<450 for r in result['regions']))

    def test_blank_page_is_unreadable_and_does_not_generate_a_fake_line(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);image=root/'blank.png';Image.new('L',(300,400),255).save(image)
            model=LineReader('0123456789');checkpoint=root/'model.pt'
            torch.save({'state_dict':model.state_dict(),'alphabet':model.alphabet,'version':2},checkpoint)
            result=recognize(checkpoint,image)
            self.assertEqual(result['pages'][0]['observations'][0]['lines'],[])
            self.assertIn('no_printed_text_regions_found',result['recognition']['detection']['warnings'])

    def test_reencoded_pixels_cannot_leak_into_a_different_split(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);image=Image.fromarray(np.arange(1024,dtype=np.uint8).reshape(32,32))
            image.save(root/'a.png',compress_level=0)
            info=PngImagePlugin.PngInfo();info.add_text('description','same pixels')
            image.save(root/'b.png',pnginfo=info,compress_level=9)
            self.assertNotEqual((root/'a.png').read_bytes(),(root/'b.png').read_bytes())
            rows=[{'id':name,'image':name+'.png','text':'1','group':name,'split':split,'provenance':'generated-test'} for name,split in [('a','train'),('b','test')]]
            manifest=root/'labels.jsonl';manifest.write_text('\n'.join(map(json.dumps,rows)))
            with self.assertRaisesRegex(ValueError,'content leaks'):
                read_manifest(manifest,'test')

    def test_native_layout_sorts_columns_preserves_cells_and_separates_overprinted_stamp(self):
        def word(text,x,y,w=70,h=12):
            return {'text':text,'xMin':x,'yMin':y,'xMax':x+w,'yMax':y+h}
        words=[word('TOTAL RATE',20,100),word('PICK',20,150,30),word('875.50',350,100),word('1',70,150,8),
               word('Doc ID: 334455',15,404,70,5),word('Send bills',35,400,100,12)]
        wide=geometric_rows(words,False);cells=geometric_rows(words,True)
        self.assertIn('TOTAL RATE 875.50',[r['text'] for r in wide])
        self.assertIn('PICK 1',[r['text'] for r in cells])
        self.assertIn('TOTAL RATE',[r['text'] for r in cells])
        self.assertIn('Doc ID: 334455',[r['text'] for r in cells])
        self.assertNotIn('Doc ID: 334455 Send bills',[r['text'] for r in cells])
        self.assertFalse(native_usable([{'lines':[{'text':'(cid:2) '*50}]}]))

    @unittest.skipUnless(shutil.which('pdftotext') and shutil.which('pdftoppm') and shutil.which('node'), 'Requires Poppler and Node')
    def test_native_pdf_to_core_and_offline_review_without_any_model(self):
        # A complete independent fixture, built without a PDF authoring library.
        rows=['RATE CONFIRMATION','PRO #: 84751','TOTAL RATE: 875.50','CARRIER: ALPHA TRANSPORT',
              'PICKUP: 2026-09-21','DELIVERY: 2026-09-22']
        stream='BT /F1 14 Tf 40 750 Td '+''.join(('0 -30 Td ' if i else '')+'('+text+') Tj\n' for i,text in enumerate(rows))+'ET'
        objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
                 '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
                 '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',f'<< /Length {len(stream)} >>\nstream\n{stream}\nendstream']
        data=b'%PDF-1.4\n';offsets=[0]
        for i,obj in enumerate(objects,1):
            offsets.append(len(data));data+=f'{i} 0 obj\n{obj}\nendobj\n'.encode()
        xref=len(data);data+=('xref\n0 6\n0000000000 65535 f \n'+''.join(f'{n:010} 00000 n \n' for n in offsets[1:])+f'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n').encode()
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);pdf=root/'sample.pdf';pdf.write_bytes(data)
            meta=read_document(pdf,root/'review')
            result=json.loads((root/'review'/'result.json').read_text())
            self.assertEqual(meta['assets'][0]['mode'],'native-pdf')
            self.assertIsNone(meta['checkpointSha256'])
            group=next(d for d in result['documents'] if d['kind']=='rate_confirmation')
            self.assertEqual(group['fields']['loadNumber']['value'],'84751')
            self.assertEqual(group['fields']['totalRate']['value'],'875.50')
            self.assertFalse(group['canAutoFile'])
            self.assertTrue((root/'review'/'review.html').is_file())
            self.assertEqual(len(result['pages'][0]['observations']),2)
            self.assertTrue((root/'review'/'reference-words.json').is_file())
            # Replacing source pixels must invalidate the review, even when
            # the candidate text and old metadata have not changed.
            Image.new('RGB',(20,20),'white').save(root/'review'/'page-1.png')
            retry=subprocess.run(['node',str(Path(__file__).with_name('review.mjs')),str(root/'review')],capture_output=True,text=True)
            self.assertNotEqual(retry.returncode,0)
            self.assertIn('Source image changed',retry.stderr)


if __name__=='__main__':
    unittest.main()
