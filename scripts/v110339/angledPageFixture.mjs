// Procedural paper and carpet; no customer image or text is included.
export function angledPageFixture({angle=55,width=600,height=1000}={}){
  const data=new Uint8ClampedArray(width*height*4),r=angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
  const cx=width*.5,cy=height*.52,pw=width*.46,ph=height*.4;
  const corners=[[-pw/2,-ph/2],[pw/2,-ph/2],[pw/2,ph/2],[-pw/2,ph/2]].map(([x,y])=>({x:(cx+c*x-s*y)/(width-1),y:(cy+s*x+c*y)/(height-1)}));
  const colors=[[210,35,35],[30,160,55],[35,65,210],[180,60,170]];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const texture=((x*71+y*137+x*y*7)%127)/127;
    let rgb=[80+texture*80,66+texture*65,45+texture*55];
    // A second, partially visible sheet must not expand the main crop.
    if(x>width*.72&&y>height*.86){rgb=[238,237,232];if(y%21<3&&x<width*.97)rgb=[45,45,45];}
    const u=((x-cx)*c+(y-cy)*s)/pw+.5,v=(-(x-cx)*s+(y-cy)*c)/ph+.5;
    if(u>=0&&u<=1&&v>=0&&v<=1){
      rgb=[242,240,235];
      if(u>.16&&u<.84&&v>.2&&v<.81&&Math.floor(v*ph)%19<2&&Math.floor(u*pw)%29<23)rgb=[40,40,40];
      for(let i=0;i<4;i++){const mx=i===0||i===3?.11:.89,my=i<2?.11:.89;if(Math.abs(u-mx)<.035&&Math.abs(v-my)<.035)rgb=colors[i];}
    }
    data.set([...rgb,255],(y*width+x)*4);
  }
  return {width,height,data,corners};
}
