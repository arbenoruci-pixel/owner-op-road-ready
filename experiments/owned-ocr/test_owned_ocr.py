import json
import tempfile
import unittest
from pathlib import Path
import torch
from PIL import Image, ImageDraw, ImageFont
from data import collate, image_tensor, read_manifest
from model import LineReader, decode, edit_distance
from recognize import recognize


class OwnedReaderTests(unittest.TestCase):
    def setUp(self):
        torch.set_num_threads(2)
        torch.manual_seed(7)

    def test_ctc_repeated_digits_require_blanks(self):
        # 1,1 collapses; 1,blank,1 preserves the duplicate character.
        paths=torch.tensor([[2],[2],[0],[2],[3],[0]])
        probs=torch.full((6,1,11),-100.)
        probs.scatter_(2,paths[:,:,None],0)
        self.assertEqual(decode(probs,'0123456789'),['112'])

    def test_ctc_gradients_are_finite_and_padding_lengths_are_preserved(self):
        model=LineReader('0123456789')
        samples=[(torch.rand(1,32,128),'11233'),(torch.rand(1,32,64),'902')]
        images,labels,lengths,target_lengths=collate(samples,model.alphabet)
        self.assertEqual(lengths.tolist(),[32,16])
        optimizer=torch.optim.AdamW(model.parameters(),lr=.001)
        before=model.output.weight.detach().clone()
        loss=torch.nn.CTCLoss()(model(images),labels,lengths,target_lengths)
        self.assertTrue(torch.isfinite(loss))
        loss.backward();optimizer.step()
        self.assertTrue(torch.isfinite(model.output.weight.grad).all())
        self.assertFalse(torch.equal(before,model.output.weight))

    def test_checkpoint_roundtrip_and_source_regions(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            model=LineReader('0123456789');model.eval()
            weights=root/'model.pt';torch.save({'state_dict':model.state_dict(),'alphabet':model.alphabet},weights)
            image=root/'source.png';Image.new('L',(200,100),255).save(image)
            result=recognize(weights,image,[{'x':20,'y':10,'width':100,'height':30}])
            observation=result['pages'][0]['observations'][0]
            self.assertEqual(observation['source'],'owned-line-reader-v1')
            self.assertEqual(observation['lines'][0]['box'],{'x':.1,'y':.1,'width':.5,'height':.3})
            self.assertIsNone(observation['lines'][0]['confidence'])
            with self.assertRaises(ValueError):
                recognize(weights,image,[{'x':190,'y':0,'width':20,'height':30}])

    def test_manifest_rejects_group_and_image_leakage(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);Image.new('L',(40,32),255).save(root/'a.png');Image.new('L',(50,32),255).save(root/'b.png')
            first={'id':'a','image':'a.png','text':'1','group':'vendor-a','split':'train','provenance':'synthetic-test'}
            second={**first,'id':'b','image':'b.png','split':'test'}
            manifest=root/'labels.jsonl'
            manifest.write_text('\n'.join(map(json.dumps,[first,second])))
            with self.assertRaisesRegex(ValueError,'group leaks'):
                read_manifest(manifest,'train')
            second.update(group='vendor-b',image='a.png')
            manifest.write_text('\n'.join(map(json.dumps,[first,second])))
            with self.assertRaisesRegex(ValueError,'content leaks'):
                read_manifest(manifest,'test')

    def test_character_error_counts_insertions_deletions_and_replacements(self):
        self.assertEqual(edit_distance('123','13'),1)
        self.assertEqual(edit_distance('123','1823'),1)
        self.assertEqual(edit_distance('123','193'),1)


if __name__=='__main__':
    unittest.main()
