import assert from "node:assert/strict";
import {referenceParts,renameReferences,compiledParts} from "../../../js/ng/ng_references.js";
import {caseFold} from "../../../js/ng/ng_casefold.js";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";

const card=(id,name,media="image")=>({media,widgets:{context_id:id,name,usage:"reference"}});
const figure=card("figure","Straße"),voice=card("voice","Große Musik","audio"),video=card("video","İzmir","video");
const checks=[
  ["all Unicode scalar values agree with Python",()=>{
    const hash=createHash("sha256");
    for(let code=0;code<=0x10ffff;code++)if(code<0xd800||code>0xdfff)hash.update(caseFold(String.fromCodePoint(code))+"\0");
    const expected=JSON.parse(readFileSync(new URL("casefold_digest.json",import.meta.url),"utf8"));
    assert.equal(hash.digest("hex"),expected.sha256,`Python Unicode ${expected.unicode}`);
  }],
  ["casefold draft names",()=>{
    const parts=referenceParts("@STRASSE follows @i\u0307zmir and @GROSSE MUSIK.",[figure,video,voice]).filter(p=>p.entry||p.unknown);
    assert.deepEqual(parts.map(p=>p.entry?.widgets.context_id),["figure","video","voice"]);
    assert.deepEqual(parts.map(p=>p.text),["@STRASSE","@i\u0307zmir","@GROSSE MUSIK"]);
  }],
  ["rename casefold aliases by stable ID",()=>{
    assert.equal(renameReferences("@STRASSE greets @Strassex and @ctx_old.",{figure:"Straße"},[card("figure","Alice")]),
      "@Alice greets @Strassex and @ctx_old.");
  }],
  ["canonical soundtrack and voice labels",()=>{
    const labels={"<Video 1>":"video","<Audio 1>":"video","<Audio 2>":"voice"};
    const parts=compiledParts("<Video 1> <Audio 1> <Audio 2>",[{kind:"video",ctx_id:"video"},{kind:"audio",ctx_id:"voice"}],
      [video,voice],labels).filter(p=>p.text.startsWith("<"));
    assert.deepEqual(parts.map(p=>p.entry),[video,video,voice]);
  }],
  ["canonical subjects override picture ordinals",()=>{
    const second=card("second","Outfit");
    const parts=compiledParts("<Picture 1> <Picture 2> <Subject 1> <Subject 2>",
      [{kind:"picture",ctx_id:"figure"},{kind:"picture",ctx_id:"second"}],[figure,second],
      {"<Picture 1>":"figure","<Picture 2>":"second","<Subject 1>":"second"}).filter(p=>p.text.startsWith("<"));
    assert.deepEqual(parts.map(p=>p.entry),[figure,second,second,undefined]);
  }],
  ["older live backend soundtrack labels",()=>{
    const withSound={...video,widgets:{...video.widgets,context_options:JSON.stringify({schema_version:1,video_audio:"reference"})}};
    const parts=compiledParts("<Video 1> <Audio 1> <Audio 2>",[{kind:"video",ctx_id:"video"},{kind:"audio",ctx_id:"voice"}],
      [withSound,voice]).filter(p=>p.text.startsWith("<"));
    assert.deepEqual(parts.map(p=>p.entry),[withSound,withSound,voice]);
  }],
  ["dotted/ascii names stay distinct",()=>{
    const dotted=card("dot","İris"),ascii=card("ascii","Iris");
    const parts=referenceParts("@İris @IRIS @ıris",[dotted,ascii]).filter(p=>p.entry||p.unknown);
    assert.deepEqual(parts.map(p=>p.entry?.widgets.context_id),["dot","ascii",undefined]);
    assert.equal(parts[2].unknown,true);
  }]
];
let failed=0;
for(const [name,check] of checks){try{check();console.log("PASS",name);}catch(error){failed++;console.error("FAIL",name,error.message);}}
assert.equal(failed,0,`${failed} reference checks failed`);
