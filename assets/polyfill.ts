import { _decorator, Component, Node, director, Animation, Vec3, AnimationState, Quat } from 'cc';
import { PREVIEW } from 'cc/env';

if (PREVIEW) {
    polyfill();
}

const additiveMap = new WeakMap<AnimationState, {
    additiveWeight: number;
}>;

let _LayeredBlendStateBuffer: any;

export class Layer {
    constructor(animation: Animation, public name: string, weight = 0.0) {
        this._animation = animation;
        this.weight = weight;
    }

    private _animation: Animation;
    state: AnimationState | null = null;
    weight: number;

    public play(name: string) {
        const state = this._animation.getState(name);
        state?.play();
        this.state = state;
    }
}

export function addAdditiveCapability(animation: Animation, additiveClipNames: string[]) {
    for (const clip of animation.clips) {
        clip.enableTrsBlending = true;
    }
    
    const blendStateBuffer = new _LayeredBlendStateBuffer();
    for (const stateName in animation._nameToState) {
        const state = animation._nameToState[stateName];
        state.destroy();
        state._curveLoaded = false;
        state.initialize(animation.node, blendStateBuffer);
    }

    for (const additiveClipName of additiveClipNames) {
        const state = animation.getState(additiveClipName);
        additiveMap.set(state, { additiveWeight: 0.0 });
    }

    const layers: Layer[] = [];

    return {
        update(deltaTime: number) {
            for (const layer of layers) {
                layer.state?.update(deltaTime);
                blendStateBuffer.commitLayer(layer.weight);
            }
            blendStateBuffer.apply();
        },

        addLayer(name: string, weight = 0.0) {
            layers.push(new Layer(animation, name, weight));
            return layers[layers.length - 1];
        },
    };
}

class Vec3BlendState {
    constructor(currentValue: Readonly<Vec3>) {
        Vec3.copy(this.defaultValue, currentValue);
    }

    public refCount = 0;

    defaultValue = new Vec3();

    result = new Vec3();

    layerResult = new Vec3();

    blend(value: Readonly<Vec3>, weight: number) {
        Vec3.lerp(this.layerResult, this.layerResult, value, weight);
    }

    commitLayer(weight: number) {
        Vec3.lerp(this.result, this.result, this.layerResult, weight);
        Vec3.copy(this.layerResult, this.defaultValue);
    }

    reset() {
        Vec3.copy(this.result, this.defaultValue);
    }
}

class QuatBlendState {
    constructor(currentValue: Readonly<Quat>) {
        Quat.copy(this.defaultValue, currentValue);
    }

    public refCount = 0;

    defaultValue = new Quat();

    result = new Quat();

    layerResult = new Quat();

    blend(value: Readonly<Quat>, weight: number) {
        Quat.slerp(this.layerResult, this.layerResult, value, weight);
    }

    commitLayer(weight: number) {
        Quat.slerp(this.result, this.result, this.layerResult, weight);
        Quat.copy(this.layerResult, this.defaultValue);
    }

    reset() {
        Quat.copy(this.result, this.defaultValue);
    }
}

function polyfill() {
    const BlendStateBuffer = director.getAnimationManager()._blendStateBuffer.constructor;
    const LegacyNodeBlendState = new BlendStateBuffer().createNodeBlendState().constructor;

    class LayeredLegacyNodeBlendState extends LegacyNodeBlendState {
        public commitLayer(weight: number) {
            const {
                position,
                rotation,
                scale,
            } = this._properties;
            position?.commitLayer(weight);
            rotation?.commitLayer(weight);
            scale?.commitLayer(weight);
        }

        protected _createVec3BlendState(currentValue: Readonly<Vec3>) {
            return new Vec3BlendState(currentValue);
        }

        protected _createQuatBlendState(currentValue: Readonly<Quat>) {
            return new QuatBlendState(currentValue);
        }

        public apply(node: Node) {
            const {
                position,
                rotation,
                scale,
            } = this._properties;
            if (position) {
                position.accumulatedWeight = 1.0;
            }
            if (scale) {
                scale.accumulatedWeight = 1.0;
            }
            if (rotation) {
                rotation.accumulatedWeight = 1.0;
            }

            super.apply(node);
        }
    }

    class LayeredBlendStateBuffer extends BlendStateBuffer {
        public commitLayer(weight: number) {
            this._nodeBlendStates.forEach((nodeBlendState, node) => {
                const {
                    position,
                    rotation,
                    scale,
                } = nodeBlendState._properties;
                position?.commitLayer(weight);
                rotation?.commitLayer(weight);
                scale?.commitLayer(weight);
            });
        }

        protected createNodeBlendState() {
            return new LayeredLegacyNodeBlendState();
        }

        public apply() {
            // this.commitLayer(1.0);
            super.apply();
        }
    }
    _LayeredBlendStateBuffer = LayeredBlendStateBuffer;

    const _sampleCurves_vendor = AnimationState.prototype._sampleCurves;
    AnimationState.prototype._sampleCurves = function(this: AnimationState, time: number) {
        const additiveInfo = additiveMap.get(this);
        if (additiveInfo) {
            this._poseOutput.is_additive = true;
            this._poseOutput.__additiveWeight = additiveInfo.additiveWeight;
        }
        _sampleCurves_vendor.call(this, time);
    }

    const createWriter_vendor = BlendStateBuffer.prototype.createWriter;
    BlendStateBuffer.prototype.createWriter = function(this: any, ...args: unknown[]) {
        const [_, _1, host] = args;
        const writer_vendor = createWriter_vendor.call(this, ...args);
        // if (!host.is_additive) {
        //     return writer_vendor;
        // }

        const writer_polyfilled = {
            setValue(value) {
                const blendState_vendor = this._propertyBlendState;
                const weight = this._host.weight;
                // if (this._host.is_additive) {
                //     if (blendState_vendor.result instanceof Vec3) {
                //         const { result } = blendState_vendor;
                //         const addition = Vec3.lerp(new Vec3(), Vec3.ZERO, value, this._host.__additiveWeight);
                //         Vec3.add(result, result, addition);
                //         blendState_vendor.accumulatedWeight = 1.0;
                //         // blendState_vendor.blend(value, weight);
                //         return;
                //     }
                // }
                blendState_vendor.blend(value, weight);
            },
        };
        Object.setPrototypeOf(writer_polyfilled, writer_vendor);
        return writer_polyfilled;
    };
}
