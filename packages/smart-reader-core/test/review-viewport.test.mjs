import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewSourceBoxes,reviewViewport} from '../src/reviewViewport.js';
const evidence={pageId:'page-1',observationId:'clean',sourceImageId:'page-1:clean',box:{x:.65,y:.82,width:.24,height:.02}};
const image={width:1200,height:1800},viewport={width:300,height:230};

test('focus enlarges the selected source line and keeps it visible near the page edge',()=>{
  const boxes=reviewSourceBoxes(evidence),view=reviewViewport({image,viewport,boxes});
  assert.ok(view.zoom>3);assert.ok(view.width>viewport.width);
  const box=boxes[0];
  assert.ok(box.x*view.width>=view.left&&box.y*view.height>=view.top);
  assert.ok((box.x+box.width)*view.width<=view.left+viewport.width);
  assert.ok((box.y+box.height)*view.height<=view.top+viewport.height);
});

test('wrapped names include both rows only on the exact selected image',()=>{
  const tail={...evidence,box:{x:.65,y:.845,width:.25,height:.02}};
  const unrelated=[{...tail,sourceImageId:'other'},{...tail,observationId:'other'},{...tail,pageId:'page-2'}];
  const before=structuredClone([evidence,tail]);
  const boxes=reviewSourceBoxes(evidence,[tail,tail,...unrelated]);assert.equal(boxes.length,2);
  const view=reviewViewport({image,viewport,boxes});
  for(const box of boxes){assert.ok(box.y*view.height>=view.top);assert.ok((box.y+box.height)*view.height<=view.top+viewport.height);}
  assert.deepEqual([evidence,tail],before);
});

test('full image and missing coordinates show the complete source without inventing a highlight',()=>{
  const boxes=reviewSourceBoxes({...evidence,box:null},[evidence]);assert.deepEqual(boxes,[]);
  for(const options of [{boxes},{boxes:[evidence.box],whole:true}]){
    const view=reviewViewport({image,viewport,...options});
    assert.equal(view.zoom,1);assert.equal(view.left,0);assert.equal(view.top,0);
    assert.ok(view.width<=viewport.width&&view.height<=viewport.height);
  }
  assert.deepEqual(reviewSourceBoxes({...evidence,sourceImageId:null}),[]);
  assert.deepEqual(reviewSourceBoxes({...evidence,box:{x:-.1,y:0,width:.2,height:.2}}),[]);
});

test('zoom and resized viewports clamp to valid image bounds for full pages and cropped sources',()=>{
  for(const source of [image,{width:600,height:60}])for(const size of [viewport,{width:220,height:180}])for(const zoom of [-10,1,4,10000]){
    const view=reviewViewport({image:source,viewport:size,boxes:[evidence.box],zoom});
    assert.ok(view.zoom>=1&&view.zoom<=view.maximum);
    assert.ok(view.left>=0&&view.top>=0);
    assert.ok(view.left<=Math.max(0,view.width-size.width));assert.ok(view.top<=Math.max(0,view.height-size.height));
  }
  assert.equal(reviewViewport({image,viewport:{width:0,height:230}}),null);
});

test('a narrow OCR crop starts at a readable text size and can fit back into the window',()=>{
  const image={width:600,height:50},boxes=[{x:.03,y:.1,width:.92,height:.25},{x:.03,y:.55,width:.92,height:.25}];
  const focused=reviewViewport({image,viewport,boxes});
  assert.ok(focused.height*boxes[0].height>=18);
  assert.ok(focused.width>viewport.width,'long source lines can be panned without shrinking the text');
  const whole=reviewViewport({image,viewport,boxes,whole:true});
  assert.ok(whole.width<=viewport.width&&whole.height<=viewport.height);
});
