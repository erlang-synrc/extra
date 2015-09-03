-module(n2o_dynroute).
-author('Andrey Martemyanov').
-include_lib("n2o/include/wf.hrl").
-compile(export_all).
-export(?ROUTING_API).

finish(State, Ctx) -> {ok, State, Ctx}.
init(State, Ctx) ->
    Path = wf:path(Ctx#cx.req),
    {ok, State, Ctx#cx{path=Path,module=route_prefix(Path)}}.

route_prefix(<<"/ws/",P/binary>>) -> route(P);
route_prefix(<<"/",P/binary>>) -> route(P);
route_prefix(P) -> route(P).

default() -> login.
location() -> "apps/*/ebin/*.beam".

route(<<"favicon.ico">>) -> static_file;
route(Route) -> storage_lookup(Route).

storage_lookup(Route) ->
    Name=binary_to_list(Route),
    case lists:any(fun(Path) -> Name=:=filename:basename(Path,".beam") end,
        filelib:wildcard(location())) of true -> binary_to_atom(Route,latin1);
            false -> ets_lookup(Route) end.

ets_lookup(Route) ->
    case ets:info(filesystem) of
        undefined -> default();
        _ -> case ets:lookup(filesystem,binary_to_list(Route)++".beam") of
                [] -> default();
                _ -> binary_to_atom(Route,latin1) end end.
