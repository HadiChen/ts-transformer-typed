import { typedData } from './';
import type { Foo } from './data';

type TId =number[];

const foo = typedData<Foo>();

// const bar = typedData<TId>();

const testFoo = () => {
  console.log(foo);
  // console.log(bar);
};

testFoo();
