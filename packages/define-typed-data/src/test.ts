import { typedData } from './';
import type { Foo } from './data';

const foo = typedData<Foo>();

const testFoo = () => {
  console.log(foo);
};

testFoo();
