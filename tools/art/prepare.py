"""Normalize actual built-in image-generation outputs; never draw replacement art."""
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
import json, hashlib, shutil
ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT/'art/source'
OUT = ROOT/'apps/web/public/assets/generated'
REV = ROOT/'art/review'
GEN = Path('/Users/manath/.codex/generated_images/01a1a7e5-6c85-72d3-9509-cf38df4249e6')
# Exact observed tool artifact IDs; source files are immutable.
SPECS = [
('P01-lobby','694a5668-9103-49e6-b9f8-6f824f1bdea8','lobby-night',(480,640)),
('P02-player','b2f9a976-d310-45d1-acec-ad943a576c10','player',(192,96)),
('P03-thug','a78a48ea-811a-4ed9-b076-396731787b8f','enemy-thug',(192,96)),
('P04-runner','7a4c147b-0e41-41ec-bbdf-51d7a23463ee','enemy-runner',(192,96)),
('P05-brute','2d9f3552-d419-4c3e-9035-422fbc3885a9','enemy-brute',(192,96)),
('P06-boss','a57cbd23-619c-4c2a-b687-9173c6bdd64b','boss',(256,128)),
('P07a-asphalt','bc71cfde-8c56-44df-8d60-74eab1e4a384','tile-asphalt',(32,32)),
('P07b-sidewalk','fef3a1c2-10b7-4996-9fc3-de158e342953','tile-sidewalk',(32,32)),
('P07c-road-marking','861ce368-5cc3-4ecd-8108-09c597625885','tile-road-marking',(32,32)),
('P08-lamp','e4af63ed-bc5b-47c0-a83e-894c7c9f6d25','prop-lamp',(48,64)),
('P08-bin','2ebca0b6-a6c8-4a29-abe5-8d067cb65a6c','prop-bin',(32,32)),
('P08-fence','71b29280-3954-4ede-8b25-e30574bc1dd6','prop-fence',(64,32)),
('P08-car','d76e8348-3559-45d6-92f3-919b306c7c31','prop-car',(48,80)),
('P08-neon','9d8ca212-8fc8-4297-9ca0-a6541052ec3c','prop-neon',(64,48)),
('P09-money','847869c8-5271-439f-ade8-7fb310c4fad7','pickup-money',(16,16)),
('P09-xp','cf47e0e7-4f63-48d4-959e-0bad63216c82','pickup-xp',(16,16)),
('P09-medkit','430cce31-d642-45d8-bf9e-ca16baa5c375','pickup-medkit',(16,16)),
('P10-run','40d2d30c-7807-47ca-9a49-0051b750eba6','icon-run',(24,24)),
('P10-casino','b4c2edb5-469d-4273-93bf-5cc0461f17de','icon-casino',(24,24)),
('P10-gang','5aeab738-0321-4512-9c23-6afc431e0876','icon-gang',(24,24)),
('P10-city','7ee23c0e-f066-416d-bc4f-d1ef4f9b8395','icon-city',(24,24)),
('P11-rocket','f60d7a9c-966b-4f7b-b5ed-ed2606c11334','rocket',(64,64)),
]
for d in (SRC,OUT,REV): d.mkdir(parents=True,exist_ok=True)
NEAR=Image.Resampling.NEAREST

def hard_alpha(im):
    im=im.convert('RGBA')
    im.putalpha(im.getchannel('A').point(lambda a:255 if a>=220 else 0))
    return im

def fit(im,size,pad=2,bottom=False):
    box=im.getbbox()
    assert box, 'empty image'
    im=im.crop(box)
    s=min((size[0]-2*pad)/im.width,(size[1]-2*pad)/im.height)
    im=im.resize((max(1,round(im.width*s)),max(1,round(im.height*s))),NEAR)
    result=Image.new('RGBA',size)
    result.alpha_composite(im,((size[0]-im.width)//2,size[1]-pad-im.height if bottom else (size[1]-im.height)//2))
    return result

assets=[]
for source,ident,name,size in SPECS:
    version='v02' if name in ('player','tile-sidewalk') else 'v01'
    raw=SRC/f'{source}-{version}.png'
    if not raw.exists(): shutil.copy2(GEN/f'exec-{ident}.png',raw)
    original=Image.open(raw)
    im=hard_alpha(original)
    info={'source':str(raw.relative_to(ROOT)),'runtime':f'apps/web/public/assets/generated/{name}.png','tool':'image_gen.imagegen','model':None,'generationArtifact':f'exec-{ident}.png','sourceSize':list(original.size),'sourceMode':original.mode,'sourceSha256':hashlib.sha256(raw.read_bytes()).hexdigest(),'promptReference':'docs/art/PROMPTS.md — corresponding P task; normalized English request used in chat','processing':[]}
    if name=='lobby-night':
        im=ImageOps.fit(original.convert('RGB'),size,method=NEAR)
        info['processing']=['aspect-preserving crop and nearest-neighbor resize']
    elif name in ('player','enemy-thug','enemy-runner','enemy-brute','boss'):
        cell=size[1]//2
        # Visual inspection confirmed one complete pose per equal source cell.
        frames=[]; crops=[]
        for i in range(8):
            box=(round((i%4)*im.width/4),round((i//4)*im.height/2),round((i%4+1)*im.width/4),round((i//4+1)*im.height/2))
            part=im.crop(box); bbox=part.getbbox(); assert bbox
            assert bbox[0]>0 and bbox[1]>0 and bbox[2]<part.width and bbox[3]<part.height, (name,i,bbox)
            crops.append(part.crop(bbox))
        # Single scale for all 8 poses, including downed; never stretch.
        scale=min((cell-6)/max(p.width for p in crops),(cell-10)/max(p.height for p in crops))
        im=Image.new('RGBA',size)
        for i,p in enumerate(crops):
            p=p.resize((max(1,round(p.width*scale)),max(1,round(p.height*scale))),NEAR)
            frame=Image.new('RGBA',(cell,cell))
            baseline=57 if cell==64 else 42
            frame.alpha_composite(p,((cell-p.width)//2,baseline+1-p.height))
            frames.append(frame);im.alpha_composite(frame,((i%4)*cell,(i//4)*cell))
        assert len({p.tobytes() for p in frames})==8, name
        review=Image.new('RGB',(cell*4,cell*2),'#141B25');review.paste(im,mask=im.getchannel('A'))
        review.save(REV/f'{name}-1x.png');review.resize((review.width*4,review.height*4),NEAR).save(REV/f'{name}-4x.png')
        gif=[]
        for i in (2,3,4,5):
            bg=Image.new('RGB',(cell,cell),'#141B25');bg.paste(frames[i],mask=frames[i].getchannel('A'));gif.append(bg.resize((cell*4,cell*4),NEAR))
        gif[0].save(REV/f'{name}-run.gif',save_all=True,append_images=gif[1:],duration=140,loop=0)
        info['processing']=['alpha threshold 220 (RGB dark details preserved)','visually inspected 4x2 source cells, crop each alpha bounding box','one proportional scale shared by all eight poses','bottom baseline 42 / boss 57; centered x','nearest-neighbor resize; 4x2 assembly']
        info['frames']=8;info['frameSize']=[cell,cell];info['uniqueFrames']=8
    elif name in ('tile-asphalt','tile-sidewalk'):
        im=original.convert('RGB')
        im=im.transform(size,Image.Transform.AFFINE,(im.width/32,0,-im.width/64,0,im.height/32,-im.height/64),resample=NEAR)
        # Equal boundary pixels remove a hard border discontinuity, using source colors.
        for x in range(32): im.putpixel((x,31),im.getpixel((x,0)))
        for y in range(32): im.putpixel((31,y),im.getpixel((0,y)))
        rep=Image.new('RGB',(96,96))
        for y in range(3):
            for x in range(3): rep.paste(im,(x*32,y*32))
        rep.resize((384,384),NEAR).save(REV/f'{name}-3x3.png')
        info['processing']=['nearest-neighbor downsample','copy opposite edge source pixels to ensure matched boundaries']
    else:
        if name=='prop-neon':
            # Actual generated sign on right side of unwanted facade; isolate sign only.
            im=im.crop((1110,385,1268,630))
            info['processing'].append('manual source crop x1110 y385 x1268 y630: only hanging sign')
        im=fit(im,size,bottom=name=='prop-lamp')
        if name=='prop-lamp':
            base=im.getchannel('A').crop((0,size[1]-4,size[0],size[1])).getbbox()
            dx=size[0]//2-(base[0]+base[2])//2
            shifted=Image.new('RGBA',size);shifted.alpha_composite(im,(dx,0));im=shifted
            info['processing'].append('align base center to x24 at bottom')
        info['processing']+=['alpha threshold 220; no RGB black removal','alpha-bbox crop and proportional nearest-neighbor fit; >=2px padding']
    dest=OUT/f'{name}.png';im.save(dest)
    assert im.size==size
    info['size']=list(size);info['runtimeSha256']=hashlib.sha256(dest.read_bytes()).hexdigest()
    if im.mode=='RGBA':
        a=im.getchannel('A');assert a.getextrema()==(0,255)
        box=a.getbbox();assert box[0]>=2 and box[1]>=2 and box[2]<=size[0]-2 and box[3]<=size[1]-2,(name,box)
        info['alphaRange']=list(a.getextrema());info['contentBounds']=list(box)
    else: info['opaque']=True
    info['status']='needs-fix' if info.get('frames') else 'ready'
    if info.get('frames'): info['limitations']=['Generated poses have idle foot/shape jitter and imperfect alternating stride. Technical atlas ready; animation polish and in-game playback review outstanding.']
    assets.append(info)
# All static assets in actual size and 4x against three required backgrounds.
static=[a for a in assets if not a.get('frames') and a['size']!=[480,640]]
canvas=Image.new('RGB',(960,((len(static)+5)//6)*150),'#080B10');draw=ImageDraw.Draw(canvas)
for n,a in enumerate(static):
    x=(n%6)*160;y=(n//6)*150
    p=Image.open(ROOT/a['runtime']).convert('RGBA');draw.text((x+4,y+3),Path(a['runtime']).stem,fill='#E7EDF5')
    canvas.paste(p,(x+4,y+20),p)
    large=p.resize((p.width*2,p.height*2),NEAR)
    # overview uses 2x where needed; separate per-file 4x below.
    large.thumbnail((145,100),NEAR);canvas.paste(large,(x+4,y+45),large)
    multi=Image.new('RGB',(p.width*12,p.height*4))
    for j,c in enumerate(('#080B10','#141B25','#1B2532')):
        bg=Image.new('RGB',p.size,c);bg.paste(p,mask=p.getchannel('A'));multi.paste(bg.resize((p.width*4,p.height*4),NEAR),(j*p.width*4,0))
    multi.save(REV/(Path(a['runtime']).stem+'-backgrounds.png'))
canvas.save(REV/'static-overview.png')
# Characters at 1x on required backgrounds including actual asphalt.
char=Image.new('RGB',(480,240),'#080B10')
for row,c in enumerate(('#080B10','#141B25','asphalt')):
    if c=='asphalt':
        tile=Image.open(OUT/'tile-asphalt.png')
        for yy in range(160,240,32):
            for xx in range(0,480,32):char.paste(tile,(xx,yy))
    else: ImageDraw.Draw(char).rectangle((0,row*80,479,row*80+79),fill=c)
    for j,a in enumerate([a for a in assets if a.get('frames')]):
        p=Image.open(ROOT/a['runtime']);cell=a['frameSize'][0];p=p.crop((0,0,cell,cell));char.paste(p,(j*90+12,row*80+8),p)
char.save(REV/'characters-backgrounds-1x.png');char.resize((960,480),NEAR).save(REV/'characters-backgrounds-2x.png')
(ROOT/'docs/art/ASSET_PROVENANCE.json').write_text(json.dumps({'project':'STREET LEGENDS','schemaVersion':1,'generatedOn':'2026-11-04','tool':'image_gen.imagegen','model':None,'note':'All sources generated with native tool. Model not exposed. No supplied screenshot used as output. See chat for exact submitted prompts; reference document and processing recorded per asset. Gameplay animation not tested.','assets':assets},ensure_ascii=False,indent=2)+'\n')
(REV/'validation.json').write_text(json.dumps({'runtimeCount':len(assets),'dimensions':'pass','alphaAndPadding':'pass','uniqueCharacterFrames':'8 each','modelKnown':False,'gameplayTested':False},indent=2)+'\n')
print(f'Prepared {len(assets)} runtime PNGs; dimension, alpha, padding, 8 unique-frame checks passed.')
