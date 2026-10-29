export const DEFAULT_LIMIT = 5;

export const GRAPH_ARGS = [
  "-c",
  "log.graphColors=cyan,magenta,blue,yellow,green,red",
  "log",
  "--graph",
  "--topo-order",
  "--decorate=short",
  "--date=format:%Y-%m-%d %H:%M",
  "--format=%C(bold yellow)%h%C(reset)  %C(bold)%s%C(reset) %C(auto)%d%C(reset)%n%C(dim)   └─ %an · %ad%C(reset)%n",
];
