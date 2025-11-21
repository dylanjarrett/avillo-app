// AvilloOS Layout Glue
export function assembleLayout(Component) {
  return function Wrapped(props) {
    return <Component {...props} />;
  };
}
