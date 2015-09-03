-module (element_htmledit).
-author('doxtop@synrc.com').
-compile(export_all).
-include_lib("n2o_bootstrap/include/wf.hrl").
-include_lib("kernel/include/file.hrl").

render_element(R= #htmlbox{}) ->
    Id = case R#htmlbox.id of undefined-> wf:temp_id(); I -> I end,
    PreviewId = case R#htmlbox.post_target of undefined -> "preview_"++Id; T-> T end, 
    Html = case R#htmlbox.html of undefined -> ""; H -> wf:js_escape(H) end,
    Up =  #upload{id = wf:temp_id(),
        root = R#htmlbox.root,
        dir = R#htmlbox.dir,
        delegate = element_htmledit,
        delegate_query = element_htmledit,
        delegate_api = R#htmlbox.delegate_api,
        post_write = R#htmlbox.post_write,
        img_tool = R#htmlbox.img_tool,
        post_target = PreviewId,
        size = R#htmlbox.size},

    UploadPostback = wf_event:new(Up, Id, element_htmledit, control_event, <<"''">>),
    PostbackFun = wf:temp_id(),
    wf:wire(wf:f("window['~s'] = function(){~s};", [PostbackFun, UploadPostback])),

    wf_tags:emit_tag(<<"div">>, wf:render(Html),[
        {<<"id">>, Id},
        {<<"style">>, R#htmlbox.style},
        {<<"class">>, R#htmlbox.class},
        {<<"data-edit">>, <<"htmlbox">>},
        {<<"data-upload-postback">>, PostbackFun},
        {<<"data-upload">>, wf:html_encode(wf:f("~s", [wf:render([Up,#p{body=["&nbsp;"]}])]))}]).

control_event(_Cid, #upload{} = Tag) -> element_upload:wire(Tag);
control_event(Cid, {query_file, Root, Dir, File, MimeType, PostWrite, Target})->
  Name = binary_to_list(File),
  Size = case file:read_file_info(filename:join([Root,Dir,Name])) of 
    {ok, FileInfo} ->
      wf:wire(wf:f("$('#~s').parent('.file_upload').after(\"<img src='~s' style='width:auto'>\").remove();", [Cid, filename:join([Dir, Name])])),

      ThDir = filename:join([Root, Dir, "thumbnail"]),
      post_write(PostWrite, Target, Root, Dir, Name, MimeType, filename:join([ThDir--Root, Name])),

      FileInfo#file_info.size;
    {error, _} -> 0 end,
  {exist, Size};
control_event(Cid, {Root, Dir, File, MimeType, Data, ActionHolder, PostWrite, ImgTool, Target, Size}) ->
    Full = filename:join([Root, Dir, File]),
    file:write_file(Full, Data, [write, raw]),
    wf:wire(wf:f("$('#~s').parent('.file_upload').after(\"<img src='~s' style='width:auto;'>\").remove();", [Cid, filename:join([Dir, File])])),

    case PostWrite of undefined-> undefined;
    Api ->
        Thumb = case ImgTool of undefined ->"";
        M ->
            Ext = filename:extension(File),
            Name = filename:basename(File, Ext),
            ThDir = filename:join([Root, Dir, "thumbnail"]),
            [begin
                Th = filename:join([ThDir, Name++"_"++integer_to_list(X)++"x"++integer_to_list(Y)++Ext]),
                En = filelib:ensure_dir(Th),
                M:make_thumb(Full, X, Y, Th) end || {X, Y}<- Size],
                filename:join([ThDir--Root, Name++Ext]) end,
            post_write(Api, Target, Root, Dir, File, MimeType, Thumb) end,
    wf:flush(ActionHolder);
control_event(A,B)-> wf:info("control event ~p ~p", [A,B]).

post_write(undefined,_,_,_,_,_,_) -> skip;
post_write(Api, Target, Root, Dir, File, MimeType, Thumb)->
    Full = filename:join([Root, Dir, File]),
    wf:wire(wf:f("~s({preview: '~s', id:'~s', file:'~s', type:'~s', thumb:'~s'});", [
        Api, Target, element_upload:hash(Full), filename:join([Dir,File]), MimeType, Thumb ])).
