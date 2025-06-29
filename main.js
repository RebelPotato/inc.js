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

const init_dispatch = {
  input(i, op, ctx) {
    ctx.group[i] = op.group;
  },
  linear(i, op, ctx) {
    ctx.group[i] = op.group;
  },
  delay(i, op, ctx) {
    ctx.group[i] = ctx.group[op.arg];
    ctx.state[i] = ctx.group[i].zero();
  },
  sum(i, op, ctx) {
    ctx.group[i] = ctx.group[op.args[0]];
    for (const arg of op.args)
      if (ctx.group[arg] !== ctx.group[i]) {
        throw new Error(
          `Sum operation ${i} has inconsistent groups: ${ctx.group[i]} vs ${ctx.group[arg]}`
        );
      }
    ctx.state[i] = ctx.group[i].zero();
  },
  integral(i, op, ctx) {
    ctx.group[i] = ctx.group[op.arg];
    ctx.state[i] = ctx.group[i].zero();
  },
  bilinear(i, op, ctx) {
    ctx.group[i] = op.group;
  },
  feedback(i, op, ctx) {
    if (ctx.ops[op.arg].type !== "integral") {
      throw new Error(
        `Feedback operation ${i} must be connected to an Integral`
      );
    }
    ctx.group[i] = ctx.group[op.arg];
  },
};

const step_dispatch = {
  input(i, op, ctx) {
    ctx.result[i] = op.value;
  },
  linear(i, op, ctx) {
    const x = ctx.result[op.arg];
    ctx.result[i] = op.fn(x);
  },
  delay(i, op, ctx) {
    ctx.result[i] = ctx.state[i];
    ctx.state[i] = ctx.result[op.arg];
  },
  sum(i, op, ctx) {
    ctx.result[i] = ctx.group[i].zero();
    for (const arg of op.args)
      ctx.result[i] = ctx.group[i].add(ctx.result[i], ctx.result[arg]);
  },
  integral(i, op, ctx) {
    ctx.state[i] = ctx.group[i].add(ctx.state[i], ctx.result[op.arg]);
    ctx.result[i] = ctx.state[i];
  },
  bilinear(i, op, ctx) {
    ctx.result[i] = op.fn(ctx.result[op.arg0], ctx.result[op.arg1]);
  },
  feedback(i, op, ctx) {
    ctx.result[i] = ctx.result[op.arg];
    state[op.arg] = ctx.result[i];
  },
};
class RunCtx {
  constructor(ops) {
    this.ops = ops;
    this.group = Array(ops.length);
    this.state = [];
    for (let i = 0; i < ops.length; i++) {
      const op = this.ops[i];
      if (init_dispatch[op.type]) init_dispatch[op.type](i, op, this);
      else {
        throw new Error(`Unknown operation type: ${op.type}`);
      }
    }
  }
  next() {
    this.result = Array(this.ops.length);
    for (let i = 0; i < this.ops.length; i++) {
      const op = this.ops[i];
      if (step_dispatch[op.type]) step_dispatch[op.type](i, op, this);
      else {
        throw new Error(`Unknown operation type: ${op.type}`);
      }
    }
    return this.result;
  }
}

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
  neg: (a) => -a,
};

function test() {
  const ops = [
    Input(1, num_group),
    Integral(0),
    Delay(1),
    Linear((x) => x * 2, 1, num_group),
    Bilinear((x, y) => x * y, 2, 3, num_group),
  ];
  console.log("ops", ops);
  const t = new RunCtx(ops);
  for (let i = 0; i < 10; i++) {
    const x = t.next();
    console.log(x[x.length - 1]);
  }

  const deltaed = delta(ops);
  deltaed.push(Integral(deltaed.length - 1));
  console.log("deltaed", deltaed);
  const dt = new RunCtx(deltaed);
  for (let i = 0; i < 10; i++) {
    const x = dt.next();
    console.log(x[x.length - 1]);
    if (i === 0) dt.ops[0].value = 0;
  }
}
test();
