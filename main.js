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
  input(i, ctx) {
    ctx.group[i] = ctx.ops[i].group;
  },
  linear(i, ctx) {
    ctx.group[i] = ctx.ops[i].group;
  },
  delay(i, ctx) {
    ctx.group[i] = ctx.group[ctx.ops[i].arg];
    ctx.state[i] = ctx.group[i].zero();
  },
  sum(i, ctx) {
    ctx.group[i] = ctx.group[ctx.ops[i].args[0]];
    for (const arg of ctx.ops[i].args)
      if (ctx.group[arg] !== ctx.group[i]) {
        throw new Error(
          `Sum operation ${i} has inconsistent groups: ${ctx.group[i]} vs ${ctx.group[arg]}`
        );
      }
    ctx.state[i] = ctx.group[i].zero();
  },
  integral(i, ctx) {
    ctx.group[i] = ctx.group[ctx.ops[i].arg];
    ctx.state[i] = ctx.group[i].zero();
  },
  bilinear(i, ctx) {
    ctx.group[i] = ctx.ops[i].group;
  },
  feedback(i, ctx) {
    ctx.group[i] = ctx.group[ctx.ops[i].arg];
  },
};

const step_dispatch = {
  input(i, ctx) {
    ctx.result[i] = ctx.ops[i].value;
  },
  linear(i, ctx) {
    const x = ctx.result[ctx.ops[i].arg];
    ctx.result[i] = ctx.ops[i].fn(x);
  },
  delay(i, ctx) {
    ctx.result[i] = ctx.state[i];
    ctx.state[i] = ctx.result[ctx.ops[i].arg];
  },
  sum(i, ctx) {
    ctx.result[i] = ctx.group[i].zero();
    for (const arg of ctx.ops[i].args)
      ctx.result[i] = ctx.group[i].add(ctx.result[i], ctx.result[arg]);
  },
  integral(i, ctx) {
    ctx.state[i] = ctx.group[i].add(ctx.state[i], ctx.result[ctx.ops[i].arg]);
    ctx.result[i] = ctx.state[i];
  },
  bilinear(i, ctx) {
    ctx.result[i] = ctx.ops[i].fn(
      ctx.result[ctx.ops[i].arg0],
      ctx.result[ctx.ops[i].arg1]
    );
  },
  feedback(i, ctx) {
    ctx.result[i] = ctx.result[ctx.ops[i].arg];
    state[ctx.ops[i].arg] = ctx.result[i];
  },
};
class RunCtx {
  constructor(ops) {
    this.ops = ops;
    this.group = Array(ops.length);
    this.state = [];
    for (let i = 0; i < ops.length; i++) {
      const op = this.ops[i];
      if (init_dispatch[op.type]) init_dispatch[op.type](i, this);
      else {
        throw new Error(`Unknown operation type: ${op.type}`);
      }
    }
  }
  next() {
    this.result = Array(this.ops.length);
    for (let i = 0; i < this.ops.length; i++) {
      const op = this.ops[i];
      if (step_dispatch[op.type]) step_dispatch[op.type](i, this);
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
  console.log("ops", ops);
  const t = new RunCtx(ops);
  for (let i = 0; i < 10; i++) {
    const x = t.next();
    console.log(x[x.length - 1]);
  }

  const deltaed = delta(ops);
  console.log("deltaed", deltaed);
  const dt = new RunCtx(deltaed);
  for (let i = 0; i < 10; i++) {
    const x = dt.next();
    console.log(x[x.length - 1]);
    if (i === 0) dt.ops[0].value = 0;
  }
}
test();
