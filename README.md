# A Simple Vue-like MVVM framework implementation.

This is a simple vue-like mvvm implementation, it implements most directives in Vue1.x.

### How to run
Download and open `example.html` in your browser.

### Prerequisite:
Assume you are familiar with the popular and awesome MVVM framework Vue. This simple repo has the same API as Vue.
For geting started on Vue, please visit [here](https://vuejs.org/v2/guide/).

### Under the hood:
For nearly a decade, front end guys are always fighting against a real world problem: how to show data **efficiently** on web pages.

**Two way data binding** is one of the many brilliant ways on tackling the efficiency problem. Many framework or libraries claiming it as their core feature: Angular1.x, backbone, etc.

But how to implement two way data binding differs from library to library. Angular1.x uses so-called `dirty checking` mechanism that looping through every dependencies to check whether the value changed. But Vue uses a completely different method.

Vue uses `Object.defineProperty` to change the `getter` and `setter` method of each property, and when the data has changed, it emit a message to the subscriber who is listening the changing, the update the view on the webpage.


So the program can be divided into these modules:
#### Observer
An observer keep watching the data object's **every** property, if there's a change, it will notify the subscriber.

#### Compiler
A compiler scan every node element and its attributes and properties, and change the data according to the directives. 
 
#### Watcher
A watcher is a bridge connecting the `Observer` and the `Compilter`, subscriber and receive every attribute's changing notification, and execute the callback on updating the view.

#### MVVM entrance
A container object for all three above.



##### references:

http://www.lucaongaro.eu/blog/2012/12/02/easy-two-way-data-binding-in-javascript/

https://github.com/DMQ/mvvm

https://vuejs.org/v2/guide/reactivity.html
