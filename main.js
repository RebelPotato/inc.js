/// streams with incremental updates
const Input = (value, group) => ({ type: "input", value, group });
const Linear = (fn, arg, group) => ({ type: "linear", fn, arg, group });
const Delay = (arg) => ({ type: "delay", arg });
const Sum = (args) => ({ type: "sum", args });
const Integral = (arg) => ({ type: "integral", arg });
const Bilinear = (fn, arg0, arg1, group) => ({
  type: "bilinear",
  fn,
  arg0,
  arg1,
  group,
});
const Feedback = (arg) => ({ type: "feedback", arg }); // feedback with a single delay

function run(ops, group, state, dispatch) {
  const result = Array(ops.length);
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (dispatch[op.type]) dispatch[op.type](i, op, group, state, result);
    else {
      throw new Error(`Unknown operation type: ${op.type}`);
    }
  }
  return result;
}
const init_dispatch = {
  input(i, op, group, state) {
    group[i] = op.group;
  },
  linear(i, op, group, state) {
    group[i] = op.group;
  },
  delay(i, op, group, state) {
    group[i] = group[op.arg];
    state[i] = group[i].zero();
  },
  sum(i, op, group, state) {
    group[i] = group[op.args[0]];
    for (const arg of op.args)
      if (group[arg] !== group[i]) {
        throw new Error(
          `Sum operation ${i} has inconsistent groups: ${group[i]} vs ${group[arg]}`
        );
      }
    state[i] = group[i].zero();
  },
  integral(i, op, group, state) {
    group[i] = group[op.arg];
    state[i] = group[i].zero();
  },
  bilinear(i, op, group, state) {
    group[i] = op.group;
  },
  feedback(i, op, group, state) {
    group[i] = group[op.arg];
  },
};
const init = (ops, group, state) => run(ops, group, state, init_dispatch);

const step_dispatch = {
  input(i, op, group, state, result) {
    result[i] = op.value;
  },
  linear(i, op, group, state, result) {
    result[i] = op.fn(result[op.arg]);
  },
  delay(i, op, group, state, result) {
    result[i] = state[i];
    state[i] = result[op.arg];
  },
  sum(i, op, group, state, result) {
    result[i] = group[i].zero();
    for (const arg of op.args) result[i] = group[i].add(result[i], result[arg]);
  },
  integral(i, op, group, state, result) {
    state[i] = group[i].add(state[i], result[op.arg]);
    result[i] = state[i];
  },
  bilinear(i, op, group, state, result) {
    result[i] = op.fn(result[op.arg0], result[op.arg1]);
  },
  feedback(i, op, group, state, result) {
    result[i] = result[op.arg];
    state[op.arg] = result[i];
  },
};
const step = (ops, group, state) => run(ops, group, state, step_dispatch);

const delta_dispatch = {
  input(op, mapping, new_ops) {
    new_ops.push(Input(op.value, op.group));
  },
  linear(op, mapping, new_ops) {
    new_ops.push(Linear(op.fn, mapping[op.arg], op.group));
  },
  delay(op, mapping, new_ops) {
    new_ops.push(Delay(mapping[op.arg]));
  },
  sum(op, mapping, new_ops) {
    new_ops.push(Sum(op.args.map((arg) => mapping[arg])));
  },
  integral(op, mapping, new_ops) {
    new_ops.push(Integral(mapping[op.arg]));
  },
  bilinear(op, mapping, new_ops) {
    new_ops.push(Bilinear(op.fn, mapping[op.arg0], mapping[op.arg1], op.group));
    const a_op_b = new_ops.length - 1;
    new_ops.push(Integral(mapping[op.arg0]));
    new_ops.push(Delay(new_ops.length - 1));
    new_ops.push(
      Bilinear(op.fn, new_ops.length - 1, mapping[op.arg1], op.group)
    );
    const da_op_b = new_ops.length - 1;
    new_ops.push(Integral(mapping[op.arg1]));
    new_ops.push(Delay(new_ops.length - 1));
    new_ops.push(
      Bilinear(op.fn, mapping[op.arg0], new_ops.length - 1, op.group)
    );
    const a_op_db = new_ops.length - 1;
    new_ops.push(Sum([a_op_b, da_op_b, a_op_db]));
  },
  feedback(op, mapping, new_ops) {
    new_ops.push(Feedback(mapping[op.arg]));
  },
};
function delta(ops) {
  const new_ops = [];
  const mapping = Array(ops.length);
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (delta_dispatch[op.type]) {
      delta_dispatch[op.type](op, mapping, new_ops);
      mapping[i] = new_ops.length - 1;
    } else {
      throw new Error(`Unknown operation type: ${op.type}`);
    }
  }
  return new_ops;
}

const num_group = {
  zero: () => 0,
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
};

function test() {
  const ops = [
    Input(1, num_group),
    Integral(0),
    Delay(1),
    Linear((x) => x * 2, 1, num_group),
    Bilinear((x, y) => x * y, 2, 3, num_group),
  ];
  const state = [];
  const group = [];
  console.log("ops", ops);
  init(ops, group, state);
  for (let i = 0; i < 10; i++) {
    const x = step(ops, group, state);
    console.log(x[x.length - 1]);
  }

  const deltaed = delta(ops);
  console.log("deltaed", deltaed);
  init(deltaed, group, state);
  for (let i = 0; i < 10; i++) {
    const x = step(deltaed, group, state);
    console.log(x[x.length - 1]);
    if (i === 0) deltaed[0].value = 0;
  }
}
test();
